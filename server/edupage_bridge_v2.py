import sys
import json
import datetime
from edupage_api import Edupage
from edupage_api.exceptions import BadCredentialsException, CaptchaException
from edupage_api.login import Login, TwoFactorLogin
import re

# Monkey Patch Login.login to fix parsing issues (GitHub Issue #101)
# Monkey Patch Login.login to fix parsing issues (GitHub Issue #101)
def fixed_login(self, username, password, subdomain="login1"):
    print("DEBUG: Executing fixed_login monkey patch", file=sys.stderr)
    request_url = f"https://{subdomain}.edupage.org/login/?cmd=MainLogin"
    try:
        response = self.edupage.session.get(request_url)
        data = response.content.decode()
    except Exception as e:
        print(f"DEBUG: Initial GET failed: {e}", file=sys.stderr)
        raise e

    # Robust extraction of csrftoken
    csrf_token = ""
    try:
        if '"csrftoken":"' in data:
            csrf_token = data.split('"csrftoken":"')[1].split('"')[0]
        else:
            # Fallback using regex
            m = re.search(r'"csrftoken":"([^"]+)"', data)
            if m:
                csrf_token = m.group(1)
            else:
                # Last ditch: look for input field
                m2 = re.search(r'name="csrfauth" value="([^"]+)"', data)
                if m2:
                    csrf_token = m2.group(1)
                else:
                    print('DEBUG: HTML Content snippet (No CSRF):', data[:300], file=sys.stderr) 
                    # raise ValueError("Could not find csrftoken") # Soft fail
    except Exception as e:
         print(f"DEBUG: Error extracting csrftoken: {e}", file=sys.stderr)
         pass

    parameters = {
        "csrfauth": csrf_token,
        "username": username,
        "password": password,
    }

    request_url = f"https://{subdomain}.edupage.org/login/edubarLogin.php"
    response = self.edupage.session.post(request_url, parameters)

    if "cap=1" in response.url or "lerr=b43b43" in response.url:
        print(f"DEBUG: Captcha detected. URL: {response.url}", file=sys.stderr)
        raise CaptchaException()

    if "bad=1" in response.url:
        print(f"DEBUG: Bad Credentials detected. URL: {response.url}", file=sys.stderr)
        raise BadCredentialsException()

    data = response.content.decode()
    
    # DEBUG: See what we actually got
    print(f"DEBUG: Login Response Start: {data[:300]}...", file=sys.stderr)

    # Handle 'eqz:' prefix (New Edupage Format)
    if data.strip().startswith("eqz:"):
        import base64
        try:
            print("DEBUG: 'eqz:' prefix detected. Decoding...", file=sys.stderr)
            json_str = base64.b64decode(data.strip()[4:]).decode("utf8")
            data_json = json.loads(json_str)
            
            # DEBUG: Print keys to understand structure
            print(f"DEBUG: Login JSON Keys: {list(data_json.keys())}", file=sys.stderr)
            
            if "gsh" in data_json:
                self.edupage.gsh = data_json["gsh"]
                print(f"DEBUG: Extracted GSH from JSON: {self.edupage.gsh}", file=sys.stderr)
            
        except Exception as e:
             print(f"DEBUG: Error decoding/parsing eqz data: {e}", file=sys.stderr)

    if subdomain == "login1":
        # Robust subdomain extraction
        try:
             if "-->" in data:
                subdomain = data.split("-->")[0].split(" ")[-1]
        except IndexError:
             pass 
        except Exception:
             pass

    self.edupage.subdomain = subdomain
    self.edupage.username = username

    if "twofactor" not in response.url:
        # 1. Try Standard Library Parsing first
        try:
            print("DEBUG: Attempting standard parse_login_data...", file=sys.stderr)
            if "var pdata =" in data:
                 print("DEBUG: 'var pdata =' found in response.", file=sys.stderr)
            else:
                 print("DEBUG: 'var pdata =' NOT found in response.", file=sys.stderr)

            self._Login__parse_login_data(data)
            print("DEBUG: Standard parsing completed.", file=sys.stderr)
        except Exception as e:
            print(f"DEBUG: Standard parse_login_data failed: {e}", file=sys.stderr)
            # Proceed to fallbacks

        # 2. Check if GSH is set
        if hasattr(self.edupage, "gsh") and self.edupage.gsh:
             print(f"DEBUG: GSH successfully set to: {self.edupage.gsh}", file=sys.stderr)
        else:
             print("DEBUG: GSH not set by standard parser. Attempting manual extraction...", file=sys.stderr)
             
             # Fallback extraction logic
             def find_gsh(content):
                # 1. Standard variable gsh
                m = re.search(r'gsh\s*[:=]\s*["\']([^"\']+)["\']', content)
                if m: return m.group(1)
                # 2. JSON key "gsh"
                m = re.search(r'"gsh":"([^"]+)"', content)
                if m: return m.group(1)
                # 3. Inside Drupal/Edupage settings "school_gsh"
                m = re.search(r'\"school_gsh\"\s*:\s*\"([0-9a-fA-F]+)\"', content)
                if m: return m.group(1)
                # 4. ASC.gsechash (New Format!)
                m = re.search(r'ASC\.gsechash\s*=\s*["\']([^"\']+)["\']', content)
                if m: return m.group(1)
                # 5. Generic gsechash
                m = re.search(r'gsechash\s*[:=]\s*["\']([^"\']+)["\']', content)
                if m: return m.group(1)
                
                return None

             found = find_gsh(data)
             if found:
                 self.edupage.gsh = found
                 print(f"DEBUG: Extracted GSH manually: {self.edupage.gsh}", file=sys.stderr)
             else:
                 # Check other URLs
                 try:
                     urls_to_try = [
                         f"https://{self.edupage.subdomain}.edupage.org/user/",
                         f"https://{self.edupage.subdomain}.edupage.org/dashboard",
                         f"https://{self.edupage.subdomain}.edupage.org/"
                     ]
                     for url in urls_to_try:
                         print(f"DEBUG: Fetching {url} for GSH...", file=sys.stderr)
                         resp = self.edupage.session.get(url)
                         dash_data = resp.content.decode()
                         found = find_gsh(dash_data)
                         if found:
                            self.edupage.gsh = found
                            print(f"DEBUG: Extracted GSH from {url}: {self.edupage.gsh}", file=sys.stderr)
                            break
                 except Exception as e:
                     print(f"DEBUG: Error during fallback fetches: {e}", file=sys.stderr)
        
        # Final Check
        if not hasattr(self.edupage, "gsh") or not self.edupage.gsh:
            print("DEBUG: CRITICAL - GSH could not be found. Requests will likely fail.", file=sys.stderr)
            # Defaulting to 00000000 is usually futile, but keeps 'hasattr' happy.
            self.edupage.gsh = "00000000"
            
        return

    # 2FA Handling
    print("DEBUG: 2FA Redirect detected...", file=sys.stderr)
    # ... (Keep existing 2FA logic)
    request_url = f"https://{self.edupage.subdomain}.edupage.org/login/twofactor?sn=1"
    two_factor_response = self.edupage.session.get(request_url)
    data = two_factor_response.content.decode()

    # Robust extraction for 2FA tokens
    csrf_token = ""
    authentication_token = ""
    authentication_endpoint = ""

    try:
        if 'csrfauth" value="' in data:
             csrf_token = data.split('csrfauth" value="')[1].split('"')[0]
        else:
             m = re.search(r'name="csrfauth" value="([^"]+)"', data)
             csrf_token = m.group(1) if m else ""
             
        if 'au" value="' in data:
            authentication_token = data.split('au" value="')[1].split('"')[0]
        else:
            m = re.search(r'name="au" value="([^"]+)"', data)
            authentication_token = m.group(1) if m else ""
            
        if 'gu" value="' in data:
            authentication_endpoint = data.split('gu" value="')[1].split('"')[0]
        else:
            m = re.search(r'name="gu" value="([^"]+)"', data)
            authentication_endpoint = m.group(1) if m else ""
            
    except Exception as e:
        print(f"DEBUG: Error extracting 2FA tokens: {e}", file=sys.stderr)

    return TwoFactorLogin(
        authentication_endpoint, authentication_token, csrf_token, self.edupage
    )

# Apply Patch
print("DEBUG: Applying monkey patch to Login.login", file=sys.stderr)
# Apply Patch
print("DEBUG: Applying monkey patch to Login.login", file=sys.stderr)
Login.login = fixed_login

# -----------------
# START TIMETABLE PATCH
# -----------------
from edupage_api.timetables import Timetables
import requests

def fixed_get_date_plan(self, date):
    request_url = f"https://{self.edupage.subdomain}.edupage.org/timetable/server/ttviewer.js?__func=ttviewer_getDatePlan"
    today_date = datetime.date.today()
    
    # We need to construct parameters carefully as per original library but fix the parsing
    data = {
        "__args": [
            None,
            date.year,
            date.month,
            date.day,
        ],
        "__gsh": "00000000" # Placeholder gsh? Library usually fetches it?
    }
    
    # Original library does weird things with GSH, let's look at its source via trace? 
    # Actually, the parsing error is "split".
    # The original code expects: response.text.split(response_start)[1]
    # where response_start = "ttviewer_getDatePlan_res("
    # The new response might be "eqz:..." or JSON directly.

    # Let's try to fetch and see what goes wrong.
    # We will use the library's session.
    
    payload = {
        "__args": [
            None, 
            date.year,
            date.month,
            date.day
        ],
        "__gsh": getattr(self.edupage, "gsh", "00000000")
    }
    
    response = self.edupage.session.post(request_url, json=payload)
    response_text = response.text
    
    if response_text.startswith("eqz:"):
        import base64
        print("DEBUG: Timetable response has eqz prefix. Decoding...", file=sys.stderr)
        json_str = base64.b64decode(response_text[4:]).decode("utf8")
        response_text = json_str
    
    # Check if the response follows the old "callback(" pattern
    # It seems new Edupage sends pure JSON? Or still callback?
    # If the prefix "ttviewer_getDatePlan_res(" is missing, the original code fails.
    
    print(f"DEBUG: Timetable raw response start: {response_text[:100]}", file=sys.stderr)
    
    curriculum_json = None
    
    # Attempt 1: Standard JSON
    try:
        curriculum_json = json.loads(response_text)
        # If it's pure JSON, it might be wrapped in "r"
        if "r" in curriculum_json:
             curriculum_json = curriculum_json["r"]
    except:
        pass

    # Attempt 2: Callback wrapper removal
    if not curriculum_json:
        try:
            if "ttviewer_getDatePlan_res(" in response_text:
                temp = response_text.split("ttviewer_getDatePlan_res(")[1]
                temp = temp.rsplit(")", 1)[0]
                curriculum_json = json.loads(temp)
                if "r" in curriculum_json:
                    curriculum_json = curriculum_json["r"]
        except Exception as e:
            print(f"DEBUG: Failed to parse Timetable callback format: {e}", file=sys.stderr)

    if not curriculum_json:
         print("DEBUG: Timetable parsing failed entirely.", file=sys.stderr)
         return None

    # Now we have the JSON data the library expects.
    # The library parses THIS json into objects.
    # We need to call the library's internal method OR just parse it ourselves manually?
    # Reusing library parsing is hard because it's private.
    # We will just return the raw lessons ourselves or try to inject it back?
    
    # Actually, Timetables class has `_parse_regular_lesson`.
    # But it is complex.
    # Let's just create a dummy object that has .lessons attribute?
    # The library `get_my_timetable` wants `Plan` object.
    
    # We are patching `__get_date_plan` (private).
    # Its role is to return the parsed JSON structure.
    # If we return the JSON dict, does the caller handle it?
    # Wait, the traceback says:
    # curriculum_json = curriculum_response.text.split(response_start)[1]...
    # So `__get_date_plan` does the fetching AND parsing of raw text.
    # It returns the JSON dict (or list inside 'r').
    
    return curriculum_json

# Apply Timetable Patch
print("DEBUG: Applying monkey patch to Timetables._Timetables__get_date_plan", file=sys.stderr)
Timetables._Timetables__get_date_plan = fixed_get_date_plan


def serialize_lesson(lesson, date_obj):
    if not lesson:
        return None
    
    # Classrooms/Teachers are lists, frontend expects single object or we adapt frontend
    # Let's adapt output to be friendly:
    classroom_name = ", ".join([c.name for c in lesson.classrooms]) if hasattr(lesson, "classrooms") and lesson.classrooms else ""
    teacher_name = ", ".join([t.name for t in lesson.teachers]) if hasattr(lesson, "teachers") and lesson.teachers else ""

    return {
        "id": getattr(lesson, "id", None) or str(lesson), 
        "startTime": lesson.start.strftime("%H:%M") if hasattr(lesson, "start") else "",
        "endTime": lesson.end.strftime("%H:%M") if hasattr(lesson, "end") else "",
        "date": date_obj.isoformat(),
        "subject": {"name": lesson.subject.name, "short": lesson.subject.short} if hasattr(lesson, "subject") and lesson.subject else {"name": "Unknown", "short": "?"},
        "classroom": {"name": classroom_name},
        "teacher": {"name": teacher_name},
        "class": {"name": ""} # Class info not critical for "my view"
    }

def main():
    print("DEBUG: Edupage Bridge Script v1.5 (Monkey-patched)", file=sys.stderr)
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing credentials"}))
        sys.exit(1)

    username = sys.argv[1]
    password = sys.argv[2]
    subdomain = sys.argv[3] if len(sys.argv) > 3 else "login1"

    edupage = Edupage()

    try:
        login_result = edupage.login(username, password, subdomain)
        if isinstance(login_result, TwoFactorLogin):
            print(json.dumps({"error": "2FA Required - Not supported in Kiosk mode. Please disable 2FA for this account."}))
            sys.exit(1)
    except BadCredentialsException:
        print(json.dumps({"error": "Wrong username or password"}))
        sys.exit(1)
    except CaptchaException:
        print(json.dumps({"error": "Captcha required - login manually first"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

    # Fetch Data
    today = datetime.date.today()
    tomorrow = today + datetime.timedelta(days=1)
    
    result = {
        "students": [] 
    }

    try:
        # 1. Get Children
        # The library might not have a direct "get_children" method exposed easily,
        # but usually parents have multiple 'users' linked or we can try to find them.
        # Check if we can switch user or if getting data returns data for all?
        # Standard API often returns data for the "selected" child.
        # We might need to parse the main page or use internal methods?
        
        # Let's try to see if we can get provision protocols or related users.
        # For now, we will perform a standard fetch which USUALLY defaults to the first child 
        # or the main account.
        
        # EXPERIMENTAL: Try to find siblings/children
        # This is tricky without exact API docs for the python wrapper regarding parents.
        # We will attempt to fetch data. If the API supports "switch_user", we would use it.
        # As a fallback for this Kiosk, we will just fetch the main data 
        # AND if there are multiple personas, we might need to handle that.
        
        # Currently, we will fetch for the "Current" context.
        # If the user needs multiple kids, they might need to use separate logins 
        # OR we need a way to switch.
        
        # However, let's try to fetch everything we can for the CURRENT view.
        
        # TIMETABLE
        print("DEBUG: Fetching Timetable...", file=sys.stderr)
        timetable_today = edupage.get_my_timetable(today)
        timetable_tomorrow = edupage.get_my_timetable(tomorrow)
        
        lessons = []
        if timetable_today:
            for l in timetable_today.lessons:
                 lessons.append(serialize_lesson(l, today))
        if timetable_tomorrow:
             for l in timetable_tomorrow.lessons:
                 lessons.append(serialize_lesson(l, tomorrow))

        # HOMEWORK (assignments)
        print("DEBUG: Fetching Homework...", file=sys.stderr)
        homeworks = []
        try:
            # get_homeworks might need arguments or not exist in this version?
            # We wrap in try/except
            if hasattr(edupage, "get_homeworks"):
                hws = edupage.get_homeworks() 
                # Simplistic serialization
                for hw in hws:
                    # Filter for active?
                    homeworks.append({
                        "id": getattr(hw, "id", None),
                        "title": getattr(hw, "title", "Hausaufgabe"),
                        "subject": getattr(hw, "subject", {}).name if getattr(hw, "subject", None) else "",
                        "dueDate": getattr(hw, "date", ""), # check format
                        "isDone": getattr(hw, "is_done", False)
                    })
        except Exception as e:
            print(f"DEBUG: Error fetching homework: {e}", file=sys.stderr)

        # GRADES
        print("DEBUG: Fetching Grades...", file=sys.stderr)
        grades_data = []
        try:
             if hasattr(edupage, "get_grades"):
                 grds = edupage.get_grades()
                 for g in grds:
                     grades_data.append({
                         "subject": getattr(g, "subject", {}).name if getattr(g, "subject", None) else "?",
                         "value": getattr(g, "value", ""),
                         "date": getattr(g, "date", "")
                     })
        except Exception as e:
            print(f"DEBUG: Error fetching grades: {e}", file=sys.stderr)

        # MESSAGES / NOTIFICATIONS
        print("DEBUG: Fetching Messages...", file=sys.stderr)
        messages = []
        try:
            if hasattr(edupage, "get_notifications"):
                notifs = edupage.get_notifications()
                for n in notifs[:15]: # Limit to 15
                    messages.append({
                        "title": getattr(n, "title", ""),
                        "body": getattr(n, "body", ""),
                        "type": getattr(n, "type", ""),
                        "date": getattr(n, "timestamp", "")
                    })
        except Exception as e:
             print(f"DEBUG: Error fetching messages: {e}", file=sys.stderr)


        # Add to result (Single Student for now, as library limitation is unclear)
        # If the user is a Parent with multiple kids, this might only return one.
        result["students"].append({
            "name": "Student", # Placeholder
            "timetable": lessons,
            "homework": homeworks,
            "grades": grades_data,
            "messages": messages
        })

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"DEBUG: Internal Error Traceback:\n{error_details}", file=sys.stderr)
        print(json.dumps({"error": f"Internal Error: {str(e)}", "traceback": error_details}))
        sys.exit(1)

    print(json.dumps(result))

if __name__ == "__main__":
    main()
