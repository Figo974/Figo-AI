# Processed dataset files

Initial files in this package contain normalized records from the JSONL source datasets already present:

- `chat.jsonl`: 55,668 OASST1 prompt/assistant response pairs.
- `instructions.jsonl`: 15,011 normalized Dolly 15K instruction/response examples.
- `question_answers.jsonl`: present as an empty output placeholder until the SQuAD Parquet files are processed locally.

The current package does not invent or fabricate SQuAD rows: `question_answers.jsonl` remains empty until processing succeeds. To generate the complete normalized outputs from all five datasets (including No Robots, Alpaca and SQuAD), install `pyarrow` and run `python knowledge/scripts/process_datasets.py`. Then refresh the index with `python knowledge/scripts/build_index.py`.
