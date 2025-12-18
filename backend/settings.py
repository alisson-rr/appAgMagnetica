import os
from pathlib import Path

# Configurações do Supabase
# IMPORTANTE: Substitua com suas credenciais reais do Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://nkeiylfzzrqpjjlstpcj.supabase.co")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZWl5bGZ6enJxcGpqbHN0cGNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MzUxMDQsImV4cCI6MjA3NTUxMTEwNH0.6CXM9QAe7dI8fsdLi7186DukOKqdw-y0SBjPfpbYl4I")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZWl5bGZ6enJxcGpqbHN0cGNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTkzNTEwNCwiZXhwIjoyMDc1NTExMTA0fQ.gB3C2kR_lH00OX3e7-6GasibRarPwNmsC38rHYLx2uA")

# JWT Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "1IORy8PUb/zY1Iq2L+4eGBPRncns690HcUlNOcGlc3eW6XH9AXvYDB81huRYaBq98ib11WAC5EypdxYjHhWb1Q==")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Configurar as variáveis de ambiente
os.environ['SUPABASE_URL'] = SUPABASE_URL
os.environ['SUPABASE_ANON_KEY'] = SUPABASE_ANON_KEY
os.environ['SUPABASE_SERVICE_ROLE_KEY'] = SUPABASE_SERVICE_ROLE_KEY
os.environ['JWT_SECRET'] = JWT_SECRET
os.environ['JWT_ALGORITHM'] = JWT_ALGORITHM
os.environ['JWT_EXPIRATION_HOURS'] = str(JWT_EXPIRATION_HOURS)
