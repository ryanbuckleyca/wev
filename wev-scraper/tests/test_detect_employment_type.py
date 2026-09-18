from utils.extractors import detect_employment_type_from_texts


def test_prefers_current_part_time_over_aspirational_full_time():
    text = (
        "This is a part-time position (up to 21 hours per week) with a possibility "
        "of becoming a full-time contract position."
    )
    assert detect_employment_type_from_texts([text]) == "part-time"


def test_ignores_path_to_full_time_growth_language():
    text = (
        "We are hiring a part-time coordinator. Strong performers may have a path "
        "to full-time employment within the first year."
    )
    assert detect_employment_type_from_texts([text]) == "part-time"


def test_ignores_opportunity_to_convert_to_permanent():
    text = (
        "Temporary contract role with the opportunity to convert to a permanent "
        "full-time position after six months."
    )
    assert detect_employment_type_from_texts([text]) == "temporary"


def test_plain_full_time_still_detected():
    assert (
        detect_employment_type_from_texts(
            ["Full-time Distribution Coordinator. Remuneration $20–$23/hr."]
        )
        == "full-time"
    )


def test_earliest_mention_wins_when_both_remain():
    # No hedge language — first stated type wins.
    text = "Full-time or part-time options available depending on candidate."
    assert detect_employment_type_from_texts([text]) == "full-time"


def test_could_become_full_time_does_not_override_contract():
    text = (
        "12-month contract position. High performers could become full-time "
        "employees at renewal."
    )
    assert detect_employment_type_from_texts([text]) == "contract"


def test_internal_does_not_trigger_internship():
    text = (
        "Serve as an internal project management resource for project leads. "
        "Build trusted relationships with clients and internal stakeholders. "
        "The salary range for this position is $90,000 to $115,000."
    )
    assert detect_employment_type_from_texts([text]) is None


def test_international_does_not_trigger_internship():
    assert detect_employment_type_from_texts(
        ["International development advisor. Full-time permanent role."]
    ) == "full-time"


def test_real_internship_still_detected():
    assert detect_employment_type_from_texts(
        ["Summer internship for communications students."]
    ) == "internship"
    assert detect_employment_type_from_texts(
        ["We are hiring an intern to support the research team."]
    ) == "internship"
