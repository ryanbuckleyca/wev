
from utils.url import add_url_dedup_variants, get_listing_url_variant, normalize_listing_url


def test_normalize_listing_url():
    assert normalize_listing_url(" http://test.com/ ") == "http://test.com"
    assert normalize_listing_url("http://test.com///") == "http://test.com"
    assert normalize_listing_url(None) == ""
    assert normalize_listing_url("") == ""

def test_add_url_dedup_variants():
    urls = set()
    add_url_dedup_variants("http://test.com", urls)
    assert "http://test.com" in urls
    assert "http://test.com/" in urls
    
    add_url_dedup_variants(None, urls)
    assert len(urls) == 2

def test_get_listing_url_variant():
    assert get_listing_url_variant("http://test.com") == "http://test.com/"
    assert get_listing_url_variant("http://test.com/") == "http://test.com"
    assert get_listing_url_variant("  ") == ""
    assert get_listing_url_variant(None) == ""
