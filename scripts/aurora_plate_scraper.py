#!/usr/bin/env python3
"""
Pulls menu and nutrition data from Duke's NetNutrition site and stores it as a
structured JSON dataset that can be fed into downstream LLM workflows.
"""
from __future__ import annotations

import html
import json
import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import csv
import requests
from bs4 import BeautifulSoup
from bs4.element import NavigableString, Tag

BASE_URL = "https://netnutrition.cbord.com/nn-prod/Duke"
ITEM_PANEL_ENDPOINT = f"{BASE_URL}/Unit/SelectUnitFromUnitsList"
LABEL_ENDPOINT = f"{BASE_URL}/NutritionDetail/ShowItemNutritionLabel"
EXCLUDED_UNIT_NAMES = {
    "Cafe",
    "Duke Marine Lab",
    "Freeman Cafe",
    "Nasher Museum Cafe",
    "Trinity Cafe",
    "Marketplace",
}
JSON_OUTPUT_PATH = Path.home() / "Desktop" / "duke_netnutrition.json"
CSV_OUTPUT_PATH = Path.home() / "Desktop" / "duke_netnutrition_items.csv"
REQUEST_TIMEOUT = 30
LABEL_DELAY_SECONDS = 0.1
MAX_RETRIES = 3

SESSION_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Referer": BASE_URL,
}
AJAX_HEADERS = {
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "https://netnutrition.cbord.com",
    "Referer": BASE_URL,
}

AMOUNT_PATTERN = re.compile(r"([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Zµ]+)?")
CATEGORY_ID_PATTERN = re.compile(r"toggleCourseItems\([^,]+,\s*(\d+)\)")
DETAIL_ID_PATTERN = re.compile(r"(\d+)")


def normalize_name(value: str) -> str:
    plain = (
        unicodedata.normalize("NFKD", value)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    return re.sub(r"[^a-z0-9]+", " ", plain).strip()


EXCLUDED_UNIT_TOKENS = {normalize_name(name) for name in EXCLUDED_UNIT_NAMES}


def request_with_retry(
    session: requests.Session, method: str, url: str, **kwargs: Any
) -> requests.Response:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = session.request(method, url, timeout=REQUEST_TIMEOUT, **kwargs)
            resp.raise_for_status()
            return resp
        except requests.RequestException:
            if attempt == MAX_RETRIES:
                raise
            time.sleep(1.5 * attempt)
    raise RuntimeError("request_with_retry exhausted retries")


def extract_units(markup: str) -> List[Dict[str, Any]]:
    soup = BeautifulSoup(markup, "html.parser")
    units: List[Dict[str, Any]] = []
    seen_ids: set[int] = set()
    for anchor in soup.select("[data-unitoid]"):
        raw_id = anchor.get("data-unitoid")
        if not raw_id or raw_id == "-1":
            continue
        try:
            unit_id = int(raw_id)
        except ValueError:
            continue
        if unit_id in seen_ids:
            continue
        name = anchor.get_text(strip=True)
        if not name or name.lower() == "show all units":
            continue
        seen_ids.add(unit_id)
        units.append({"id": unit_id, "name": name})
    return units


def fetch_unit_panel(session: requests.Session, unit_id: int) -> str:
    resp = request_with_retry(
        session,
        "post",
        ITEM_PANEL_ENDPOINT,
        data={"unitOid": unit_id},
        headers=AJAX_HEADERS,
    )
    payload = resp.json()
    for panel in payload.get("panels", []):
        if panel.get("id") == "itemPanel":
            return html.unescape(panel.get("html", ""))
    return ""


def parse_unit_panel(
    html_fragment: str,
    session: requests.Session,
    nutrition_cache: Dict[int, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    soup = BeautifulSoup(html_fragment, "html.parser")
    categories: List[Dict[str, Any]] = []
    category_lookup: Dict[str, Dict[str, Any]] = {}
    tables = [
        table
        for table in soup.find_all("table")
        if "Item Name" in table.get_text(" ", strip=True)
    ]
    for table in tables:
        for row in table.find_all("tr"):
            if row.find_parent("table") is not table:
                continue
            classes = row.get("class") or []
            if "cbo_nn_itemGroupRow" in classes:
                category = build_category(row)
                categories.append(category)
                if category["category_id"] is not None:
                    category_lookup[str(category["category_id"])] = category
            elif row.has_attr("data-categoryid"):
                cat = category_lookup.get(row["data-categoryid"]) or (
                    categories[-1] if categories else None
                )
                if not cat:
                    continue
                item = build_item(row, session, nutrition_cache)
                if item:
                    cat["items"].append(item)
    return [cat for cat in categories if cat["items"]]


def build_category(row: Tag) -> Dict[str, Any]:
    text = row.get_text(" ", strip=True)
    category_id = None
    onclick = row.get("onclick") or ""
    match = CATEGORY_ID_PATTERN.search(onclick)
    if match:
        category_id = int(match.group(1))
    guidance = None
    name = text
    if "(" in text and text.endswith(")"):
        idx = text.rfind("(")
        guidance = text[idx + 1 : -1].strip()
        name = text[:idx].strip()
    return {
        "category_id": category_id,
        "title": name,
        "selection_guidance": guidance,
        "raw_title": text,
        "items": [],
    }


def build_item(
    row: Tag,
    session: requests.Session,
    nutrition_cache: Dict[int, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    cells = [
        cell for cell in row.find_all("td") if cell.find_parent("tr") is row
    ]
    if len(cells) < 2:
        return None
    action_cell, name_cell = cells[0], cells[1]
    serving_cell = cells[2] if len(cells) > 2 else None
    servings_cell = cells[3] if len(cells) > 3 else None
    detail_id = extract_detail_id(action_cell, name_cell)
    item_name = extract_item_name(name_cell)
    if not item_name:
        return None
    item: Dict[str, Any] = {
        "detail_id": detail_id,
        "name": item_name,
        "description": extract_description(name_cell),
        "allergens": extract_allergens(name_cell),
        "serving_display": (
            serving_cell.get_text(" ", strip=True) if serving_cell else None
        ),
        "serving_choices": parse_serving_choices(servings_cell),
    }
    item = {k: v for k, v in item.items() if v not in (None, [], "")}
    if detail_id:
        item["nutrition"] = fetch_nutrition(detail_id, session, nutrition_cache)
    return item


def extract_detail_id(action_cell: Tag, name_cell: Tag) -> Optional[int]:
    button = action_cell.find(attrs={"data-detailoid": True})
    if button and button.get("data-detailoid"):
        try:
            return int(button["data-detailoid"])
        except ValueError:
            pass
    anchor = name_cell.find("a", id=DETAIL_ID_PATTERN)
    if anchor and anchor.get("id"):
        match = DETAIL_ID_PATTERN.search(anchor["id"])
        if match:
            return int(match.group(1))
    return None


def extract_item_name(cell: Tag) -> Optional[str]:
    anchor = cell.find("a", class_="cbo_nn_itemHover")
    if not anchor:
        return cell.get_text(" ", strip=True) or None
    parts: List[str] = []
    for child in anchor.children:
        if isinstance(child, NavigableString):
            text = str(child).strip()
            if text:
                parts.append(text)
        elif isinstance(child, Tag):
            if child.name == "span":
                continue
            text = child.get_text(" ", strip=True)
            if text:
                parts.append(text)
    if parts:
        return " ".join(parts).strip()
    return anchor.get_text(" ", strip=True) or None


def extract_description(cell: Tag) -> Optional[str]:
    desc = cell.find("div", class_=re.compile("description", re.I)) or cell.find("small")
    if desc:
        text = desc.get_text(" ", strip=True)
        return text or None
    return None


def extract_allergens(cell: Tag) -> List[str]:
    labels: List[str] = []
    for img in cell.find_all("img"):
        label = (img.get("title") or img.get("alt") or "").strip()
        if label and label not in labels:
            labels.append(label)
    return labels


def parse_serving_choices(cell: Optional[Tag]) -> Optional[Dict[str, Any]]:
    if not cell:
        return None
    select = cell.find("select")
    if not select:
        text = cell.get_text(" ", strip=True)
        return {"type": "static", "value": text} if text else None
    options: List[Dict[str, Any]] = []
    for option in select.find_all("option"):
        raw_value = option.get("value")
        label = option.get_text(" ", strip=True)
        servings = None
        try:
            servings = float(raw_value) / 100 if raw_value else None
        except (TypeError, ValueError):
            servings = None
        options.append(
            {"label": label, "raw_value": raw_value, "servings": servings}
        )
    return {"type": "select", "options": options} if options else None


def fetch_nutrition(
    detail_id: int,
    session: requests.Session,
    nutrition_cache: Dict[int, Dict[str, Any]],
) -> Dict[str, Any]:
    if detail_id in nutrition_cache:
        return nutrition_cache[detail_id]
    resp = request_with_retry(
        session,
        "post",
        LABEL_ENDPOINT,
        data={"detailOid": detail_id},
        headers=AJAX_HEADERS,
    )
    data = parse_nutrition_label(resp.text)
    nutrition_cache[detail_id] = data
    time.sleep(LABEL_DELAY_SECONDS)
    return data


def parse_nutrition_label(markup: str) -> Dict[str, Any]:
    soup = BeautifulSoup(markup, "html.parser")
    header = soup.select_one(".cbo_nn_LabelHeader")
    servings_span = soup.select_one(".cbo_nn_LabelBottomBorderLabel span")
    serving_size = soup.select_one(
        ".cbo_nn_LabelBottomBorderLabel .inline-div-right"
    )
    calories = soup.select_one(".cbo_nn_LabelSubHeader .inline-div-right")
    ingredients_block = soup.select_one(".cbo_nn_Label_IngredientsTable")
    ingredients_raw = None
    ingredients_list: Optional[List[str]] = None
    if ingredients_block:
        ingredients_raw = re.sub(
            r"^Ingredients:\s*", "", ingredients_block.get_text(" ", strip=True), flags=re.I
        ).strip()
        if ingredients_raw:
            ingredients_list = [
                token.strip() for token in re.split(r",\s*", ingredients_raw) if token.strip()
            ] or None
    return {
        "label_name": header.get_text(" ", strip=True) if header else None,
        "servings_per_container": (
            normalize_space(servings_span.get_text()) if servings_span else None
        ),
        "serving_size": (
            normalize_space(serving_size.get_text()) if serving_size else None
        ),
        "calories": parse_int(calories.get_text()) if calories else None,
        "calories_raw": normalize_space(calories.get_text()) if calories else None,
        "nutrients": parse_nutrient_rows(soup),
        "ingredients": (
            {"raw": ingredients_raw, "list": ingredients_list}
            if ingredients_raw
            else None
        ),
    }


def parse_nutrient_rows(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    nutrient_rows: List[Dict[str, Any]] = []
    for block in soup.select(
        ".cbo_nn_LabelBorderedSubHeader, .cbo_nn_LabelNoBorderSubHeader"
    ):
        left = block.select_one(".inline-div-left")
        if not left:
            continue
        label_text, amount_text = extract_label_and_amount(left)
        if not label_text:
            continue
        right = block.select_one(".inline-div-right")
        dv_text = normalize_space(right.get_text()) if right else None
        quantity, unit = parse_amount(amount_text)
        nutrient_rows.append(
            {
                "key": normalize_label_key(label_text),
                "label": label_text,
                "amount": amount_text,
                "quantity": quantity,
                "unit": unit,
                "daily_value_percent": parse_percent(dv_text),
                "daily_value_raw": dv_text,
            }
        )
    return nutrient_rows


def extract_label_and_amount(container: Tag) -> Tuple[str, Optional[str]]:
    spans = container.find_all("span")
    if len(spans) >= 2:
        label = normalize_space(spans[0].get_text())
        amount = normalize_space(spans[1].get_text())
        return label, amount
    text = normalize_space(container.get_text(" ", strip=True))
    return text, None


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def parse_amount(value: Optional[str]) -> Tuple[Optional[float], Optional[str]]:
    if not value:
        return None, None
    text = value.replace("%", "").replace("\xa0", " ").strip()
    match = AMOUNT_PATTERN.match(text)
    if not match:
        return None, None
    number = float(match.group(1))
    unit = match.group(2)
    return number, unit


def parse_percent(value: Optional[str]) -> Optional[float]:
    if not value:
        return None
    cleaned = value.replace("%", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_int(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    try:
        return int(re.sub(r"[^\d]", "", value))
    except ValueError:
        return None


def normalize_label_key(label: str) -> str:
    key = normalize_space(label).lower()
    substitutions = {
        "include na added sugars": "added_sugars",
        "potas.": "potassium",
        "potas": "potassium",
    }
    if key in substitutions:
        return substitutions[key]
    return re.sub(r"[^a-z0-9]+", "_", key).strip("_")


def main() -> None:
    session = requests.Session()
    session.headers.update(SESSION_HEADERS)
    homepage = request_with_retry(session, "get", BASE_URL).text
    discovered_units = extract_units(homepage)
    active_units: List[Dict[str, Any]] = []
    skipped_units: List[str] = []
    for unit in discovered_units:
        normalized = normalize_name(unit["name"])
        if normalized in EXCLUDED_UNIT_TOKENS:
            skipped_units.append(unit["name"])
            continue
        if unit not in active_units:
            active_units.append(unit)
    print(
        f"Discovered {len(discovered_units)} units, "
        f"processing {len(active_units)} (skipped {len(skipped_units)})"
    )
    nutrition_cache: Dict[int, Dict[str, Any]] = {}
    dataset_units: List[Dict[str, Any]] = []
    total_items = 0
    for idx, unit in enumerate(active_units, start=1):
        print(f"[{idx}/{len(active_units)}] Fetching {unit['name']}...", end=" ")
        try:
            panel_html = fetch_unit_panel(session, unit["id"])
            categories = parse_unit_panel(panel_html, session, nutrition_cache)
        except Exception as exc:  # pragma: no cover - defensive
            print("failed")
            dataset_units.append(
                {
                    "unit_id": unit["id"],
                    "name": unit["name"],
                    "error": str(exc),
                    "categories": [],
                }
            )
            continue
        item_count = sum(len(cat["items"]) for cat in categories)
        total_items += item_count
        dataset_units.append(
            {
                "unit_id": unit["id"],
                "name": unit["name"],
                "category_count": len(categories),
                "item_count": item_count,
                "categories": categories,
            }
        )
        print(f"{item_count} items across {len(categories)} categories")
    payload = {
        "source": BASE_URL,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "units_total": len(active_units),
        "units_skipped": skipped_units,
        "items_total": total_items,
        "excluded_names": sorted(EXCLUDED_UNIT_NAMES),
        "units": dataset_units,
    }
    JSON_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    JSON_OUTPUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    flat_rows = flatten_items(dataset_units)
    write_csv(flat_rows, CSV_OUTPUT_PATH)
    print(
        f"Wrote dataset to {JSON_OUTPUT_PATH} and CSV to {CSV_OUTPUT_PATH} "
        f"({total_items} items captured)"
    )


def flatten_items(units: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for unit in units:
        for category in unit.get("categories", []):
            for item in category.get("items", []):
                nutrition = item.get("nutrition") or {}
                ingredients = nutrition.get("ingredients") or {}
                rows.append(
                    {
                        "unit_id": unit.get("unit_id"),
                        "unit_name": unit.get("name"),
                        "category_id": category.get("category_id"),
                        "category_title": category.get("title"),
                        "category_guidance": category.get("selection_guidance"),
                        "item_detail_id": item.get("detail_id"),
                        "item_name": item.get("name"),
                        "description": item.get("description"),
                        "allergens": "; ".join(item.get("allergens", [])),
                        "serving_display": item.get("serving_display"),
                        "serving_choices": json.dumps(
                            item.get("serving_choices"), ensure_ascii=False
                        )
                        if item.get("serving_choices") is not None
                        else None,
                        "calories": nutrition.get("calories"),
                        "calories_raw": nutrition.get("calories_raw"),
                        "serving_size": nutrition.get("serving_size"),
                        "servings_per_container": nutrition.get(
                            "servings_per_container"
                        ),
                        "ingredients_raw": ingredients.get("raw"),
                        "ingredients_list": json.dumps(
                            ingredients.get("list"), ensure_ascii=False
                        )
                        if ingredients.get("list") is not None
                        else None,
                        "nutrients": json.dumps(
                            nutrition.get("nutrients"), ensure_ascii=False
                        )
                        if nutrition.get("nutrients") is not None
                        else None,
                    }
                )
    return rows


def write_csv(rows: List[Dict[str, Any]], path: Path) -> None:
    if not rows:
        path.write_text("")
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


if __name__ == "__main__":
    main()
