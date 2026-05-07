import sys
import json
from transformers import BertTokenizer, BertForSequenceClassification
import torch

# Requires: pip install transformers torch
tokenizer = BertTokenizer.from_pretrained("ProsusAI/finbert")
model = BertForSequenceClassification.from_pretrained("ProsusAI/finbert")
model.eval()


def score(text):
    # Normalize text to ensure it is safe for the tokenizer
    if not isinstance(text, str):
        text = str(text)

    # Strip whitespace and remove control characters
    text = text.strip().replace("\n", " ").replace("\r", " ")

    # Remove HTML tags
    import re
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[\x00-\x1f\x7f-\x9f]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    inputs = tokenizer(
        text,
        return_tensors="pt",
        max_length=512,
        truncation=True,
        padding=True
    )
    with torch.no_grad():
        outputs = model(**inputs)
    probs = torch.softmax(outputs.logits, dim=-1)
    labels = ["positive", "negative", "neutral"]
    scores = {label: prob.item() for label, prob in zip(labels, probs[0])}
    return {
        "finbertSentiment": max(scores, key=scores.get),
        "finbertScore": round(scores["positive"] - scores["negative"], 4),
        "finbertConfidence": round(max(scores.values()), 4),
    }


posts = json.loads(sys.stdin.read())
results = []
for post in posts:
    text = post.get("text", "")
    if not isinstance(text, str) or not text.strip():
        continue
    results.append({**post, **score(text)})
print(json.dumps(results))