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
        raise CaptchaException()

    if "bad=1" in response.url:
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

    # Since edupage-api mostly works for the logged-in user (student/parent)
    # If parent, we might be able to switch students? 
    # The docs don't explicitly show "switch_student". 
    # get_all_students returns all students in school (admin feature?).
    # We will assume single student context for now OR try to find children if parent.
    # But for now, let's just dump the "my" timetable.
    
    try:
        # Timetable (Today & Tomorrow)
        timetable_today = edupage.get_my_timetable(today)
        timetable_tomorrow = edupage.get_my_timetable(tomorrow)
        
        lessons = []
        if timetable_today:
            for l in timetable_today.lessons:
                 lessons.append(serialize_lesson(l, today))
        if timetable_tomorrow:
             for l in timetable_tomorrow.lessons:
                 lessons.append(serialize_lesson(l, tomorrow))

        # Notifications (Homeworks often appear here)
        # notifications = edupage.get_notifications()
        # simplified_notifs = [{"title": n.title, "body": n.body, "type": n.type} for n in notifications[:10]]

        # Construct basic student object
        result["students"].append({
            "name": "Student", # Can we get the name? edupage.user?
            "timetable": lessons,
            "homework": [], # Placeholder until we parse notifications for homework
            "inbox": []
        })

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(json.dumps({"error": f"Internal Error: {str(e)}", "traceback": error_details}))
        sys.exit(1)

    print(json.dumps(result))

if __name__ == "__main__":
    main()
