from datetime import datetime, timezone, timedelta

import pytest

from app.main import SettingsIn, as_utc


def test_as_utc_attaches_utc_to_sqlite_naive_datetime():
    value = datetime(2026, 1, 2, 3, 4, 5)
    result = as_utc(value)
    assert result == value.replace(tzinfo=timezone.utc)
    assert result.tzinfo == timezone.utc


def test_as_utc_converts_aware_datetime_to_utc():
    value = datetime(2026, 1, 2, 8, 30, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    assert as_utc(value) == datetime(2026, 1, 2, 3, 0, tzinfo=timezone.utc)


def test_whatsapp_setting_normalizes_country_code_number():
    assert SettingsIn(whatsapp="+91 98765-43210").whatsapp == "919876543210"


def test_whatsapp_setting_rejects_too_short_number():
    with pytest.raises(ValueError):
        SettingsIn(whatsapp="12345")
