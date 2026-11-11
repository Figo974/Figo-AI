# Figo AI Knowledge Index

`lexical-index.json` is a local inverted text index generated from `knowledge/processed/*.jsonl`. Refresh it after processing more datasets with:

```bash
python knowledge/scripts/build_index.py
```

This is a lexical index, not a vector embedding database. It is created locally from normalized files and does not send dataset content to an external provider. To use it for grounded chat answers, the server must query the index and pass retrieved records as context. The scripts keep raw source files untouched.
