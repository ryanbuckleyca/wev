"""Tests for extract_salary_from_text — covers FR and EN formats."""
import pytest

from utils.extractors import extract_salary_from_text


# ── French labelled ────────────────────────────────────────────────────────────
@pytest.mark.parametrize("text,expected", [
    ("Salaire à partir de 75 000$", "75 000$"),
    ("Salaire : 23$ de l'heure", "23$"),
    ("Salaire :Entre 17,51$ et 18,40$", "17,51$"),
    ("Salaire : À partir de 21$/heure, selon la grille salariale", "21$"),
    ("Salaire mensuelle: 4700$", "4700$"),
    # ranges — return full range
    ("Salaire entre 25,16 $ à 33,88 $ de l'heure selon l'expérience", "25,16 $ à 33,88 $"),
    ("Salaire : 55 236$ à 69 045$", "55 236$ à 69 045$"),
    ("Salaire horaire à l'entrée entre 28$ et 29,42$", "28$"),
    ("Salaire : 26,15 $/heure selon l'échelle en vigueur", "26,15 $"),
    ("Salaire de base de 28 $/h, plus avantages sociaux", "28 $"),
    # Rémunération
    ("Rémunération selon l'échelle salariale, entre 26.28$ et 28.15$ de l'heure.", "26.28$"),
    ("Rémunération : 45 000$ par année", "45 000$"),
    # Taux horaire
    ("Taux horaire : 25,63 $, à l'échelon 1.", "25,63 $"),
    ("Taux horaire : 24,00 $;", "24,00 $"),
    ("Taux horaire : 24.57 $, à l'échelon 1.", "24.57 $"),
])
def test_fr_labelled(text, expected):
    assert extract_salary_from_text(text) == expected


# ── French unlabelled (amount + /heure or de l'heure suffix) ──────────────────
@pytest.mark.parametrize("text,expected", [
    ("28$ de l'heure, 32 heures par semaine", "28$"),
    ("30h/semaine.  32$/heure.", "32$"),
    ("Le poste est rémunéré à 19,50$/heure.", "19,50$"),
])
def test_fr_unlabelled_heure(text, expected):
    assert extract_salary_from_text(text) == expected


# ── English labelled ───────────────────────────────────────────────────────────
@pytest.mark.parametrize("text,expected", [
    # ranges — return full range
    ("Salary: $50,000 - $60,000", "$50,000 - $60,000"),
    ("Compensation: $70,000 - $80,000 annually", "$70,000 - $80,000"),
    # single
    ("Salary: $25/hr", "$25"),
    ("Wage: $18.50 per hour", "$18.50"),
    ("salary of $45,000", "$45,000"),
])
def test_en_labelled(text, expected):
    assert extract_salary_from_text(text) == expected


# ── English bare range ─────────────────────────────────────────────────────────
@pytest.mark.parametrize("text,expected", [
    ("$50,000 - $60,000 annual salary", "$50,000 - $60,000"),
    ("$45,000 to $55,000 based on experience", "$45,000 to $55,000"),
])
def test_en_bare_range(text, expected):
    assert extract_salary_from_text(text) == expected


# ── No salary present ─────────────────────────────────────────────────────────
@pytest.mark.parametrize("text", [
    "Join our team and make a difference.",
    "Please send your CV to hr@example.com",
    "35 heures par semaine",
    "",
    None,
])
def test_no_salary(text):
    assert extract_salary_from_text(text) is None
