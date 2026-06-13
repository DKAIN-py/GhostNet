from transformers import pipeline

# This executes the initial download and saves the model graph locally
pipe = pipeline("sentiment-analysis", model="cardiffnlp/twitter-roberta-base-sentiment-latest")
pipe.save_pretrained("./local_roberta")