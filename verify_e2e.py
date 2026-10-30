from pathlib import Path
import json
import requests
from reportlab.pdfgen import canvas

base = 'http://127.0.0.1:8000'
file_path = Path('sample_company_policy.pdf')

c = canvas.Canvas(str(file_path))
c.setTitle('KnowledgeIQ Security and HR Policy')
c.setFont('Helvetica', 14)
lines = [
    'KnowledgeIQ Security and HR Policy',
    '',
    'Section 1. Password policy',
    'All employees must use a unique password of at least 12 characters and rotate it every 90 days.',
    'Passwords must not be shared with coworkers, contractors, or family members.',
    '',
    'Section 2. Incident reporting',
    'Any suspected security incident must be reported to the security team within 24 hours.',
    'The company may require an immediate password reset after a breach.',
    '',
    'Section 3. Expense reimbursement',
    'Employees may submit travel and equipment receipts for reimbursement within 30 days of purchase.',
    'Approved expenses must include vendor invoices and a business purpose statement.',
    '',
    'Section 4. Employee onboarding',
    'New hires complete onboarding by the end of their first week and receive access to approved systems.',
    'Managers must review access rights before employee start dates.',
]
textobject = c.beginText(72, 750)
for line in lines:
    textobject.textLine(line)
c.drawText(textobject)
c.save()

admin = requests.post(f'{base}/api/auth/login', json={'email': 'admin@knowledgeiq.ai', 'password': 'Admin@123'}, timeout=30)
print('ADMIN_LOGIN', admin.status_code)
print(admin.json())
admin_token = admin.json()['access_token']
headers = {'Authorization': f'Bearer {admin_token}'}

employee = requests.post(
    f'{base}/api/auth/users',
    json={'email': 'new.employee@example.com', 'password': 'Employee@123', 'full_name': 'New Employee'},
    headers=headers,
    timeout=30,
)
print('CREATE_EMPLOYEE', employee.status_code)
print(employee.text)

emp_login = requests.post(
    f'{base}/api/auth/login',
    json={'email': 'new.employee@example.com', 'password': 'Employee@123'},
    timeout=30,
)
print('EMPLOYEE_LOGIN', emp_login.status_code)
print(emp_login.json())
emp_token = emp_login.json()['access_token']
emp_headers = {'Authorization': f'Bearer {emp_token}'}

with open(file_path, 'rb') as f:
    upload = requests.post(
        f'{base}/api/upload',
        files={'files': (file_path.name, f, 'application/pdf')},
        headers=headers,
        timeout=60,
    )
print('UPLOAD', upload.status_code)
print(upload.text)

get_docs = requests.get(f'{base}/api/documents', headers=emp_headers, timeout=30)
print('DOCS', get_docs.status_code)
print(json.dumps(get_docs.json(), indent=2))

question = 'What is the password policy for employees?'
chat = requests.post(f'{base}/api/chat', json={'question': question}, headers=emp_headers, timeout=30)
print('CHAT_RELEVANT', chat.status_code)
print(chat.text)

chat_missing = requests.post(
    f'{base}/api/chat',
    json={'question': 'What is the remote access VPN policy?'},
    headers=emp_headers,
    timeout=30,
)
print('CHAT_MISSING', chat_missing.status_code)
print(chat_missing.text)

analytics = requests.get(f'{base}/api/analytics', headers=headers, timeout=30)
print('ANALYTICS', analytics.status_code)
print(analytics.text)
