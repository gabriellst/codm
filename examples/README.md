# examples/ — approved teaching canon

Everything under this directory is APPROVED exemplar material: skills link to it via their
`registry.yaml` `examples:` field (dead links fail `scripts/skill-examples.test.ts`), review
agents read it as the highest-authority demonstration of the house canon, and the
product-residue rail scans all of it — nothing here may carry purged product vocabulary.

ONE organizing principle: the top level is the SHAPE of the artifact — each shape has its own
rules and provenance.

| Dir | Shape | Rules |
|---|---|---|
| `citizens/<lang>/<citizen>/` | Per-citizen REFERENCE IMPLEMENTATIONS (entity, usecase, projector, …) by language | Verbatim snapshots with CONTEXT-ORIGIN provenance headers; never edited in place — re-harvest instead. Today: `citizens/go/` (medscall channel). |
| `slices/<name>/` | Curated END-TO-END slice/pattern exemplars | Hand-curated; each carries a README explaining the pattern it teaches (`dashboard-read-model`, `integration-registry`, `tenant-membership`). |
| `pairs/<task-id>/` | ASK→ANSWER pairs: `WANT.md` (the verbatim prompt) + `GOT/` (the build) + `NOTES.md` | Eval builds that scored high at a current doc tree, USER-approved in batch. The most direct teaching shape: "given this ask, THIS is the house answer." |

What is deliberately NOT here: the promotion QUEUE. Unapproved eval candidates live with the
machinery that produces them — `scripts/skill-evals/candidates/<task-id>/` (written by
`bun examples:promote`). Approval moves a candidate into `pairs/`; only then does it become
canon, get scanned, and become linkable from skills.
