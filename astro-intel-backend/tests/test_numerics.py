"""
Test Suite: Numerology Computation Utilities (utils/numerics.py)
Covers: reduce_number, life_path, destiny_number, name_number,
        soul_urge, personality_number, lucky_numbers, lucky_colors,
        all three letter maps (Indian, Chaldean, Pythagorean).
"""
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.numerics import (
    reduce_number, dob_digits, life_path, destiny_number,
    letter_map_indian, letter_map_chaldean, letter_map_pythagorean,
    name_number, soul_urge, personality_number,
    lucky_numbers, lucky_colors_for_number, get_traits, VOWELS,
)


class TestReduceNumber:
    def test_single_digit_unchanged(self):
        for n in range(1, 10):
            assert reduce_number(n) == n

    def test_master_number_11_preserved(self):
        assert reduce_number(11) == 11

    def test_master_number_22_preserved(self):
        assert reduce_number(22) == 22

    def test_master_number_33_preserved(self):
        assert reduce_number(33) == 33

    def test_reduces_double_digit(self):
        assert reduce_number(15) == 6   # 1+5
        assert reduce_number(29) == 11  # 2+9=11 → master preserved

    def test_reduces_triple_digit(self):
        assert reduce_number(123) == 6  # 1+2+3

    def test_reduces_to_single_eventually(self):
        assert reduce_number(99) == 9   # 9+9=18 → 1+8=9

    def test_zero_reduces(self):
        assert reduce_number(0) == 0


class TestDobDigits:
    def test_extracts_digits_from_dob(self):
        digits = dob_digits("1990-05-15")
        assert digits == [1, 9, 9, 0, 0, 5, 1, 5]

    def test_strips_dashes(self):
        digits = dob_digits("2000-01-01")
        assert 2 in digits and 0 in digits


class TestLifePath:
    def test_known_life_path(self):
        # 1990-05-15 → 1+9+9+0+0+5+1+5 = 30 → 3
        assert life_path("1990-05-15") == 3

    def test_life_path_preserves_master_number(self):
        # 1990-02-09 → 1+9+9+0+0+2+0+9 = 30 → 3
        # 1975-11-29 → 1+9+7+5+1+1+2+9 = 35 → 8
        lp = life_path("1975-11-29")
        assert 1 <= lp <= 33

    def test_all_dobs_produce_valid_number(self):
        dobs = ["1985-08-22", "2001-12-31", "1960-01-01", "1993-07-04"]
        for dob in dobs:
            result = life_path(dob)
            assert result in list(range(1, 10)) + [11, 22, 33]

    def test_destiny_equals_life_path(self):
        dob = "1990-05-15"
        assert destiny_number(dob) == life_path(dob)


class TestLetterMaps:
    def test_indian_map_covers_all_letters(self):
        lmap = letter_map_indian()
        for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
            assert ch in lmap, f"Missing letter {ch} in Indian map"

    def test_chaldean_map_covers_all_letters(self):
        lmap = letter_map_chaldean()
        for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
            assert ch in lmap

    def test_pythagorean_map_covers_all_letters(self):
        lmap = letter_map_pythagorean()
        for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
            assert ch in lmap

    def test_pythagorean_a_equals_1(self):
        assert letter_map_pythagorean()["A"] == 1

    def test_pythagorean_z_maps_correctly(self):
        # Z is 26th letter → 26 % 9 = 8
        assert letter_map_pythagorean()["Z"] == 8

    def test_all_map_values_in_range_1_to_9(self):
        for mapfn in [letter_map_indian, letter_map_chaldean, letter_map_pythagorean]:
            lmap = mapfn()
            for k, v in lmap.items():
                assert 1 <= v <= 9, f"Value {v} out of range for {k}"


class TestNameNumber:
    def test_name_number_returns_valid_int(self):
        lmap = letter_map_pythagorean()
        result = name_number("Varun Sharma", lmap)
        assert isinstance(result, int)
        assert result in list(range(1, 10)) + [11, 22, 33]

    def test_empty_name_returns_zero(self):
        lmap = letter_map_pythagorean()
        result = name_number("", lmap)
        assert result == 0

    def test_numbers_ignored_in_name(self):
        lmap = letter_map_pythagorean()
        r1 = name_number("Varun", lmap)
        r2 = name_number("Varun123", lmap)
        assert r1 == r2

    def test_case_insensitive(self):
        lmap = letter_map_pythagorean()
        assert name_number("varun", lmap) == name_number("VARUN", lmap)


class TestSoulUrge:
    def test_soul_urge_uses_only_vowels(self):
        lmap = letter_map_pythagorean()
        result = soul_urge("AEIOU", lmap)
        assert isinstance(result, int)
        assert result >= 1

    def test_soul_urge_no_vowels_returns_1(self):
        lmap = letter_map_pythagorean()
        result = soul_urge("BCD", lmap)
        assert result == 1  # fallback for no vowels

    def test_soul_urge_valid_range(self):
        lmap = letter_map_indian()
        result = soul_urge("Priya Singh", lmap)
        assert result in list(range(1, 10)) + [11, 22, 33]


class TestPersonalityNumber:
    def test_personality_uses_consonants_only(self):
        lmap = letter_map_pythagorean()
        result = personality_number("BCD", lmap)
        assert isinstance(result, int)

    def test_personality_all_vowels_returns_1(self):
        lmap = letter_map_pythagorean()
        result = personality_number("AEIOU", lmap)
        assert result == 1

    def test_personality_valid_range(self):
        lmap = letter_map_pythagorean()
        result = personality_number("Varun Sharma", lmap)
        assert result in list(range(1, 10)) + [11, 22, 33]


class TestLuckyNumbers:
    def test_lucky_numbers_contains_lp_and_name(self):
        result = lucky_numbers(7, 3)
        assert 7 in result
        assert 3 in result

    def test_lucky_numbers_sorted(self):
        result = lucky_numbers(8, 2)
        assert result == sorted(result)

    def test_lucky_numbers_no_duplicates(self):
        result = lucky_numbers(5, 5)
        assert len(result) == len(set(result))

    def test_lucky_numbers_max_three_items(self):
        result = lucky_numbers(1, 2)
        assert len(result) <= 3


class TestLuckyColors:
    def test_every_base_number_has_colors(self):
        for n in range(1, 10):
            colors = lucky_colors_for_number(n)
            assert isinstance(colors, list)
            assert len(colors) >= 1

    def test_master_numbers_have_colors(self):
        for n in [11, 22, 33]:
            colors = lucky_colors_for_number(n)
            assert isinstance(colors, list)
            assert len(colors) >= 1

    def test_unknown_number_falls_back(self):
        colors = lucky_colors_for_number(42)
        assert isinstance(colors, list)


class TestGetTraits:
    def test_every_number_1_to_9_has_traits(self):
        for n in range(1, 10):
            traits = get_traits(n)
            assert "traits" in traits
            assert "strengths" in traits
            assert "weaknesses" in traits

    def test_master_numbers_have_traits(self):
        for n in [11, 22, 33]:
            traits = get_traits(n)
            assert "traits" in traits

    def test_traits_are_lists(self):
        t = get_traits(1)
        assert isinstance(t["traits"], list)
        assert isinstance(t["strengths"], list)
        assert isinstance(t["weaknesses"], list)
