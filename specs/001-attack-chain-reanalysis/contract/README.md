# Contract examples

One JSON file per wire shape defined in `../plan.md` under "Wire contract (frozen)".
Both test suites read these files:

- `api/tests/test_contract.py` validates each with the Pydantic models and checks the
  endpoints reproduce the same key sets.
- `tests/schema.test.ts` parses each with the zod schemas.

Change the plan section first, then these files, then the tests, then code.
