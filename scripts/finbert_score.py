import json
import re
import sys

import torch
from transformers import BertForSequenceClassification, BertTokenizer

# Requires: pip install transformers torch
tokenizer = BertTokenizer.from_pretrained("ProsusAI/finbert")
model = BertForSequenceClassification.from_pretrained("ProsusAI/finbert")
model.eval()

LABELS = ["positive", "negative", "neutral"]


def sanitize_text(text):
    if not isinstance(text, str):
        text = str(text)

    text = text.strip().replace("\n", " ").replace("\r", " ")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[\x00-\x1f\x7f-\x9f]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def neutral_result(post):
    return {
        **post,
        "finbertSentiment": "neutral",
        "finbertScore": 0.0,
        "finbertConfidence": 0.0,
    }


def score_posts(posts):
    if not posts:
        return []

    normalized_posts = []
    texts = []
    for post in posts:
        safe_post = post if isinstance(post, dict) else {"text": str(post or "")}
        text = sanitize_text(safe_post.get("text", ""))
        normalized_posts.append({**safe_post, "text": text})
        texts.append(text if text else "neutral")

    inputs = tokenizer(
        texts,
        return_tensors="pt",
        max_length=128,
        truncation=True,
        padding=True,
    )

    with torch.no_grad():
        outputs = model(**inputs)

    probs = torch.softmax(outputs.logits, dim=-1)

    results = []
    for idx, post in enumerate(normalized_posts):
        row = probs[idx]
        scores = {label: row[label_idx].item() for label_idx, label in enumerate(LABELS)}

        # Empty posts remain neutral as a safe fallback.
        if not post.get("text"):
            results.append(neutral_result(post))
            continue

        results.append(
            {
                **post,
                "finbertSentiment": max(scores, key=scores.get),
                "finbertScore": round(scores["positive"] - scores["negative"], 4),
                "finbertConfidence": round(max(scores.values()), 4),
            }
        )

    return results


def main():
    raw = sys.stdin.read()
    if not raw or not raw.strip():
        print("[]")
        return

    try:
        payload = json.loads(raw)
    except Exception as err:
        sys.stderr.write(f"Invalid FinBERT input JSON: {err}\n")
        sys.exit(1)

    if payload is None:
        print("[]")
        return

    if not isinstance(payload, list):
        sys.stderr.write("FinBERT payload must be a JSON array.\n")
        sys.exit(1)

    try:
        results = score_posts(payload)
        print(json.dumps(results))
    except Exception as err:
        sys.stderr.write(f"FinBERT scoring failed: {err}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()