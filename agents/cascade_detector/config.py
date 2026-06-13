from dotenv import load_dotenv
import os

load_dotenv()

NODE_LATEST_STATE_URL: str  = os.getenv("NODE_LATEST_STATE_URL")
NODE_CASCADE_ALERT_URL: str = os.getenv("NODE_CASCADE_ALERT_URL")
EVALUATION_INTERVAL = 30  