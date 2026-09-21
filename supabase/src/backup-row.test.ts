import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isGeneratedBackupColumn, sanitizeBackupRow } from "./backup-row";

describe("sanitizeBackupRow", () => {
  it("strips generated search_* columns that staging restore cannot INSERT", () => {
    for (const col of [
      "search_municipality",
      "search_province",
      "search_name",
    ]) {
      assert.equal(isGeneratedBackupColumn(col), true);
    }

    const clean = sanitizeBackupRow({
      id: "job-1",
      municipality: "Montréal",
      province: "QC",
      search_municipality: "montreal",
      search_province: "qc",
      has_compensation: true,
    });

    assert.deepEqual(clean, {
      id: "job-1",
      municipality: "Montréal",
      province: "QC",
    });
  });

  it("strips generated org name_normalized columns", () => {
    for (const col of ["name_normalized", "alternative_names_normalized"]) {
      assert.equal(isGeneratedBackupColumn(col), true);
    }

    const clean = sanitizeBackupRow({
      id: 1,
      name: "Crisis Centre of BC",
      alternative_names: [],
      name_normalized: "crisis centre of bc",
      alternative_names_normalized: [],
    });

    assert.deepEqual(clean, {
      id: 1,
      name: "Crisis Centre of BC",
      alternative_names: [],
    });
  });
});
