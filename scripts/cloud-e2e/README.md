# Cloud E2E fixtures (agent-client)

Synthetic vault overlays for Cursor Cloud / `obsidian-plugin-development` E2E.

After `materialize-vault.sh` (from `obsidian-plugin-development`), run:

```bash
bash scripts/cloud-e2e/apply-vault-fixtures.sh
```

This copies `fixtures/vault/` into `$CLOUD_E2E_VAULT` (default `~/plugin-sandbox-Obsidian`), including:

- **agent-client** `data.json` — `defaultAgentId: cursor`, four preset key pointers only
- **whisper** `data.json` — OpenAI transcription (avoids misleading “Gemini · Default” in the status bar)

Upstream `materialize-vault.sh` should eventually merge these files from this repo; until then, run the apply script after each materialize.
