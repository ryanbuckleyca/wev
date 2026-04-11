"""Shared logging for the scraper. Uses flush so CI sees output immediately."""


def scraper_log(msg: str) -> None:
    """Print message with flush so CI sees output immediately."""
    print(msg, flush=True)
