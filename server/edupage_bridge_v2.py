import sys
import json
import datetime
from edupage_api import Edupage
from edupage_api.exceptions import BadCredentialsException, CaptchaException
from edupage_api.login import Login, TwoFactorLogin
import re

# Monkey Patch Login.login to fix parsing issues (GitHub Issue #101)
def fixed_login(self, username, password, subdomain="login1"):
    print("DEBUG: Executing fixed_login monkey patch", file=sys.stderr)
    request_url = f"https://{subdomain}.edupage.org/login/?cmd=MainLogin"
    response = self.edupage.session.get(request_url)
    data = response.content.decode()

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
                    print('DEBUG: HTML Content snippet:', data[:500], file=sys.stderr) 
                    raise ValueError("Could not find csrftoken")
    except Exception as e:
         print(f"DEBUG: Error extracting csrftoken: {e}", file=sys.stderr)
         # Don't crash yet, try empty, maybe it works?
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
        # print(f"DEBUG: Response Content: {response.content.decode()[:500]}", file=sys.stderr)
        raise BadCredentialsException()

    data = response.content.decode()

    if subdomain == "login1":
        # Robust subdomain extraction
        try:
             if "-->" in data:
                subdomain = data.split("-->")[0].split(" ")[-1]
        except IndexError:
             pass 

    self.edupage.subdomain = subdomain
    self.edupage.username = username

    if "twofactor" not in response.url:
        self._Login__parse_login_data(data) # Access private method
        return

    # 2FA Handling
    request_url = f"https://{self.edupage.subdomain}.edupage.org/login/twofactor?sn=1"
    two_factor_response = self.edupage.session.get(request_url)
    data = two_factor_response.content.decode()

    # Robust extraction for 2FA tokens
    try:
        csrf_token = data.split('csrfauth" value="')[1].split('"')[0]
    except IndexError:
        m = re.search(r'name="csrfauth" value="([^"]+)"', data)
        csrf_token = m.group(1) if m else ""

    try:
        authentication_token = data.split('au" value="')[1].split('"')[0]
    except IndexError:
         m = re.search(r'name="au" value="([^"]+)"', data)
         authentication_token = m.group(1) if m else ""

    try:
        authentication_endpoint = data.split('gu" value="')[1].split('"')[0]
    except IndexError:
         m = re.search(r'name="gu" value="([^"]+)"', data)
         authentication_endpoint = m.group(1) if m else ""

    return TwoFactorLogin(
        authentication_endpoint, authentication_token, csrf_token, self.edupage
    )

# Apply Patch
print("DEBUG: Applying monkey patch to Login.login", file=sys.stderr)
Login.login = fixed_login

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
        edupage.login(username, password, subdomain)
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
        timetable_today = edupage.get_my_timetable(today)
        timetable_tomorrow = edupage.get_my_timetable(tomorrow)
        
        lessons_today = [serialize_lesson(l, today) for l in timetable_today.lessons] if timetable_today else []
        lessons_tomorrow = [serialize_lesson(l, tomorrow) for l in timetable_tomorrow.lessons] if timetable_tomorrow else []
        all_lessons = lessons_today + lessons_tomorrow

        # HOM EWORK (assignments)
        # Verify method exists
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
            "timetable": all_lessons,
            "homework": homeworks,
            "grades": grades_data,
            "messages": messages
        })

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(json.dumps({"error": f"Internal Error: {str(e)}", "traceback": error_details}))
        sys.exit(1)

    print(json.dumps(result))

if __name__ == "__main__":
    main()
