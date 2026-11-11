# Figo AI Knowledge and Datasets

This folder keeps the existing Figo AI reference knowledge (`coding/`, `general/`, `devops/`, etc.) alongside the downloaded dataset files. Source dataset files are read-only inputs; normalized JSONL output is written to `processed/` and the local text index to `index/`.

## Dataset layout

```text
knowledge/
├── README.md
├── coding/ and other existing knowledge documents
├── raw/
│   ├── oasst1/data/2023-04-12_oasst_ready.messages.jsonl
│   ├── dolly_15k/databricks-dolly-15k.jsonl
│   ├── squad/plain_text/{train,validation}-00000-of-00001.parquet
│   ├── no_robots/data/*.parquet
│   └── alpaca/data/*.parquet
├── processed/
│   ├── chat.jsonl
│   ├── instructions.jsonl
│   ├── question_answers.jsonl  (created by the processing script)
│   └── manifest.json
├── index/
│   ├── lexical-index.json
│   └── README.md
└── scripts/
    ├── process_datasets.py
    └── build_index.py
```

## Process the datasets locally

From the project root, install the single optional data-reader dependency and run:

```bash
python -m pip install -r knowledge/requirements.txt
python knowledge/scripts/process_datasets.py
python knowledge/scripts/build_index.py
```

`process_datasets.py` normalizes OASST1, Dolly 15K, No Robots, Alpaca, and SQuAD to JSONL files. SQuAD rows preserve the question, supporting context, and reference answer. The script does not fine-tune OpenRouter/Groq models; Figo AI must retrieve matching records and include them as context when answering.

## Sources and license reminders

- OASST1: https://huggingface.co/datasets/OpenAssistant/oasst1
- Dolly 15K: https://huggingface.co/datasets/databricks/databricks-dolly-15k
- SQuAD: https://huggingface.co/datasets/rajpurkar/squad
- No Robots: https://huggingface.co/datasets/HuggingFaceH4/no_robots
- Alpaca: https://huggingface.co/datasets/tatsu-lab/alpaca

Check each upstream dataset card and license before distributing or using these files commercially. In particular, No Robots and Alpaca have non-commercial usage restrictions.

## Live chat integration (retrieval)

FigoAI does not automatically fine-tune the hosted OpenRouter/Groq model by placing files in this folder. Instead, `server.js` uses the generated `index/lexical-index.json` to retrieve relevant records from the normalized `processed/*.jsonl` files and adds a small, relevant set to the request context. This is a lightweight retrieval-augmented generation (RAG) workflow. The raw Hugging Face data is preserved and never modified by the processing scripts.

After downloading all raw data files, run:

```bash
python -m pip install -r knowledge/requirements.txt
python knowledge/scripts/process_datasets.py
python knowledge/scripts/build_index.py
```

Run both Python scripts again whenever you replace/add source data, so the lexical index offsets match the processed JSONL files. The application ignores stale legacy indexes that do not contain byte offsets; rebuild the index to enable dataset retrieval.
