import os

class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY")
    JUDGE0_IP_ADDRESS = os.environ.get("JUDGE0_IP_ADDRESS")
    OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
