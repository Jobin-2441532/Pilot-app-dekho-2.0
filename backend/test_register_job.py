import requests
API_URL = "https://dekho-api.onrender.com"
email = "job@gmail.com"
password = "DummyPassword123"
res = requests.post(f"{API_URL}/api/v1/auth/register", json={"name":"Job","email":email,"password":password,"monthly_budget":5000})
print("Register job@gmail.com:", res.status_code, res.text)

