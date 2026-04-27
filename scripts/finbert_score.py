import sys
import json
from transformers import BertTokenizer, BertForSequenceClassification
import torch

# Requires: pip install transformers torch
tokenizer = BertTokenizer.from_pretrained("ProsusAI/finbert")
model = BertForSequenceClassification.from_pretrained("ProsusAI/finbert")
model.eval()


def score(text):
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
results = [{**post, **score(post["text"])} for post in posts]
print(json.dumps(results))