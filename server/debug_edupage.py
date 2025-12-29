
import sys
import json
import datetime
import requests
import re
from edupage_api import Edupage
from edupage_api.login import Login, TwoFactorLogin

# ---------------------------------------------------------
# COPY OF MONKEY PATCHES TO ENSURE LOGIN WORKS
# ---------------------------------------------------------

def fixed_login(self, username, password, subdomain="login1"):
    print(f"DEBUG: Logging in as {username}...", file=sys.stderr)
    request_url = f"https://{subdomain}.edupage.org/login/?cmd=MainLogin"
    try:
        response = self.edupage.session.get(request_url)
        data = response.content.decode()
    except Exception as e:
        print(f"DEBUG: Initial GET failed: {e}", file=sys.stderr)
        raise e

    # CSRF Token
    csrf_token = ""
    if '"csrftoken":"' in data:
        csrf_token = data.split('"csrftoken":"')[1].split('"')[0]
    else:
        m = re.search(r'"csrftoken":"([^"]+)"', data)
        if m: csrf_token = m.group(1)
        else:
            m2 = re.search(r'name="csrfauth" value="([^"]+)"', data)
            if m2: csrf_token = m2.group(1)

    parameters = {
        "csrfauth": csrf_token,
        "username": username,
        "password": password,
    }

    request_url = f"https://{subdomain}.edupage.org/login/edubarLogin.php"
    response = self.edupage.session.post(request_url, parameters)
    data = response.content.decode()

    if data.strip().startswith("eqz:"):
        import base64
        try:
            json_str = base64.b64decode(data.strip()[4:]).decode("utf8")
            data_json = json.loads(json_str)
            if "gsh" in data_json:
                self.edupage.gsh = data_json["gsh"]
        except Exception as e:
            pass

    if subdomain == "login1":
        try:
             if "-->" in data:
                subdomain = data.split("-->")[0].split(" ")[-1]
        except: pass

    self.edupage.subdomain = subdomain
    self.edupage.username = username

    # Parse children
    children = []
    child_pattern = re.compile(r'class="[^"]*edubarProfileChildBtn[^"]*"[^>]*data-sid="([^"]+)"[^>]*>.*?<span class="userName">([^<]+)</span>', re.DOTALL)
    matches = child_pattern.findall(data)
    for cid, cname in matches:
        children.append({"id": cid, "name": cname.strip()})
    
    self.edupage.children = children
    
    # GSH Fallback
    if not hasattr(self.edupage, "gsh"):
        m = re.search(r'gsh\s*[:=]\s*["\']([^"\']+)["\']', data)
        if m: self.edupage.gsh = m.group(1)
        else:
            m = re.search(r'"gsh":"([^"]+)"', data)
            if m: self.edupage.gsh = m.group(1)
            else:
                m = re.search(r'"school_gsh\"\s*:\s*\"([0-9a-fA-F]+)\"', data)
                if m: self.edupage.gsh = m.group(1)

    return True

Login.login = fixed_login

# ---------------------------------------------------------
# PROBE FUNCTION
# ---------------------------------------------------------

def probe_timetable(edupage, child_id):
    print(f"\n--- PROBING TIMETABLE FOR CHILD {child_id} ---")
    today = datetime.date.today()
    
    # Try 1: getDatePlan with String ID
    print("\n[Test 1] ttviewer_getDatePlan with STRING ID")
    url = f"https://{edupage.subdomain}.edupage.org/timetable/server/ttviewer.js?__func=ttviewer_getDatePlan"
    payload = {
        "__args": [str(child_id), today.year, today.month, today.day],
        "__gsh": getattr(edupage, "gsh", "00000000")
    }
    try:
        res = edupage.session.post(url, json=payload)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text[:200]}...")
    except Exception as e:
        print(f"Error: {e}")

    # Try 2: getDatePlan with INT ID
    print("\n[Test 2] ttviewer_getDatePlan with INT ID")
    try:
        payload["__args"][0] = int(child_id)
        res = edupage.session.post(url, json=payload)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text[:200]}...")
    except Exception as e:
        print(f"Error: {e}")

    # Try 3: ttviewer_getTimetable
    print("\n[Test 3] ttviewer_getTimetable")
    url = f"https://{edupage.subdomain}.edupage.org/timetable/server/ttviewer.js?__func=ttviewer_getTimetable"
    # Usually: [child_id, year, month, day] or similar?
    # Or start/end date?
    # Let's try same args
    payload = {
         "__args": [str(child_id), today.year, today.month, today.day],
         "__gsh": getattr(edupage, "gsh", "00000000")
    }
    try:
        res = edupage.session.post(url, json=payload)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text[:200]}...")
    except Exception as e:
        print(f"Error: {e}")
        
    print("\n-------------------------------------------")

def main():
    if len(sys.argv) < 3:
        print("Usage: python debug_edupage.py <username> <password> <subdomain>")
        sys.exit(1)
        
    username = sys.argv[1]
    password = sys.argv[2]
    subdomain = sys.argv[3]
    
    edupage = Edupage()
    edupage.login(username, password, subdomain)
    
    print(f"Logged in. GSH: {getattr(edupage, 'gsh', 'N/A')}")
    children = getattr(edupage, "children", [])
    print(f"Children: {children}")
    
    if children:
        probe_timetable(edupage, children[0]['id'])

if __name__ == "__main__":
    main()
