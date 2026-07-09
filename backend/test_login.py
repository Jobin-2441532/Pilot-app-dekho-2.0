import requests
import json
API_URL = "https://dekho-api.onrender.com"
email = "test42@example.com"
password = "TestPassword123"
# Register
res = requests.post(f"{API_URL}/api/v1/auth/register", json={"name":"Test","email":email,"password":password,"monthly_budget":5000})
print("Register:", res.status_code, res.text)
# Login
res = requests.post(f"{API_URL}/api/v1/auth/login", data={"username":email,"password":password})
print("Login:", res.status_code, res.text)

