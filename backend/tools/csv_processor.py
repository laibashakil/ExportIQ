"""Pakistan-Textile-Mills-Council-style factory export-volume CSV ingestion."""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

log = logging.getLogger("exportiq.csv")


REQUIRED_COLUMNS = {"month", "buyer", "destination_country", "value_pkr"}


def load_export_csv(csv_path: str | Path) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"CSV missing required columns: {missing}")
    return df


def summarise_exports(df: pd.DataFrame) -> dict:
    """Return totals + buyer concentration that the Financial Impact agent consumes."""
    total = int(df["value_pkr"].sum())
    by_buyer = (
        df.groupby("buyer")["value_pkr"].sum().sort_values(ascending=False).astype(int).to_dict()
    )
    by_country = (
        df.groupby("destination_country")["value_pkr"]
        .sum().sort_values(ascending=False).astype(int).to_dict()
    )
    top_buyer = next(iter(by_buyer), None)
    concentration = (by_buyer[top_buyer] / total) if (top_buyer and total) else 0.0
    return {
        "annual_export_pkr": total,
        "exports_by_buyer_pkr": by_buyer,
        "exports_by_country_pkr": by_country,
        "top_buyer": top_buyer,
        "top_buyer_concentration_pct": round(concentration * 100, 2),
    }
