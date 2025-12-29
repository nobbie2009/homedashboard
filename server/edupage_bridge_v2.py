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
            # Find children profile regardless of parse success/failure since we have HTML
            # Proceed to fallbacks

        # Parse Children
        print("DEBUG: parsing children profiles...", file=sys.stderr)
        children = []
        try:
            # Method 1: Regex over the HTML (edubarProfileChildBtn)
            child_pattern = re.compile(r'class="[^"]*edubarProfileChildBtn[^"]*"[^>]*data-sid="([^"]+)"[^>]*>.*?<span class="userName">([^<]+)</span>', re.DOTALL)
            matches = child_pattern.findall(data)
            
            seen_ids = set()
            for cid, cname in matches:
                if cid not in seen_ids:
                    children.append({"id": cid, "name": cname.strip()})
                    seen_ids.add(cid)
                    
            print(f"DEBUG: Found children: {children}", file=sys.stderr)
        except Exception as e:
            print(f"DEBUG: Error parsing children: {e}", file=sys.stderr)

        self.edupage.children = children
        # Force visit dashboard to ensure cookies/gsh are fresh if manual extraction happened
        self.edupage.session.get(f"https://{subdomain}.edupage.org/dashboard")
        print(f"DEBUG: Session Cookies after login: {self.edupage.session.cookies.get_dict()}", file=sys.stderr)

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
                            # Also parse children from dashboard if not found yet
                            if not self.edupage.children:
                                child_pattern = re.compile(r'class="[^"]*edubarProfileChildBtn[^"]*"[^>]*data-sid="([^"]+)"[^>]*>.*?<span class="userName">([^<]+)</span>', re.DOTALL)
                                matches = child_pattern.findall(dash_data)
                                for cid, cname in matches:
                                     if cid not in [c["id"] for c in self.edupage.children]:
                                         self.edupage.children.append({"id": cid, "name": cname.strip()})
                            break
                 except Exception as e:
                     print(f"DEBUG: Error during fallback fetches: {e}", file=sys.stderr)
        
        # Final Check
        if not hasattr(self.edupage, "gsh") or not self.edupage.gsh:
            print("DEBUG: CRITICAL - GSH could not be found. Requests will likely fail.", file=sys.stderr)
            # Defaulting to 00000000 is usually futile, but keeps 'hasattr' happy.
            self.edupage.gsh = "00000000"

        # ---------------------------
        # TIMELINE PARSING (UserHome)
        # ---------------------------
        print("DEBUG: parsing timeline/userhome data...", file=sys.stderr)
        try:
            # Regex to find .userhome({ ... });
            # We look for .userhome( followed by { and capturing until the end );
            # This is tricky with nested braces, but usually the structure is simple enough.
            # Let's try matching the start and finding the matching brace or using a greedy match if it's the last script
            
            # Pattern: $j('#id').userhome({ ... });
            # We focus on capturing the JSON object inside userhome( ... )
            
            timeline_match = re.search(r'\.userhome\(\s*(\{.*?\})\s*\);', data, re.DOTALL)
            if timeline_match:
                json_str = timeline_match.group(1)
                # Cleanup potential JS artifacts if any (unlikely in pure JSON arg)
                try:
                    timeline_data = json.loads(json_str)
                    self.edupage.timeline_data = timeline_data.get("items", [])
                    print(f"DEBUG: Extracted {len(self.edupage.timeline_data)} timeline items.", file=sys.stderr)
                except json.JSONDecodeError as je:
                    print(f"DEBUG: JSON parse error for userhome: {je}", file=sys.stderr)
            else:
                print("DEBUG: .userhome call not found in HTML.", file=sys.stderr)
                self.edupage.timeline_data = []
                
        except Exception as e:
            print(f"DEBUG: Error parsing timeline: {e}", file=sys.stderr)
            self.edupage.timeline_data = []
            
        return

    # 2FA Handling
    print("DEBUG: 2FA Redirect detected...", file=sys.stderr)
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
    
    # Determine the student/child ID to fetch for.
    # If self.edupage has 'selected_child', use it. 
    # Otherwise use None (which means 'me' / parent, which fails for timetable).
    
    # If using switch_to_child, target_id should likely be None (implied by session)
    # So we prefer None if selected_child is not set or if we trust switch_to_child.
    target_id = getattr(self.edupage, "selected_child", None)
    
    # Check if target_id is effectively the same as current user? 
    # For now, let's allow it to be None.
    
    print(f"DEBUG: Fetching timetable for target_id: {target_id} (type: {type(target_id)})", file=sys.stderr)

    payload = {
        "__args": [
            target_id, 
            date.year, 
            date.month, 
            date.day
        ],
        "__gsh": getattr(self.edupage, "gsh", "00000000")
    }
    
    print(f"DEBUG: Timetable Payload: {json.dumps(payload)}", file=sys.stderr)
    
    response = self.edupage.session.post(request_url, json=payload)
    response_text = response.text
    
    if 'TypeError' in response_text or 'Cannot re' in response_text:
        print("DEBUG: Standard getDatePlan failed. Trying alternative arguments or function...", file=sys.stderr)
        # Try 1: Pass ID as explicit Integer (again, just to be thorough in this block)
        # payload['__args'][0] = int(target_id) if target_id else None
        # response = self.edupage.session.post(request_url, json=payload)
        
        # Try 2: Try 'ttviewer_getTTViewerData' ?
        # request_url_alt = request_url.replace("ttviewer_getDatePlan", "ttviewer_getTTViewerData")
        # response = self.edupage.session.post(request_url_alt, json=payload)
        pass

    if response.status_code != 200:
        print(f"DEBUG: Edupage Server Error Status: {response.status_code}", file=sys.stderr)

    
    if response_text.startswith("eqz:"):
        import base64
        print("DEBUG: Timetable response has eqz prefix. Decoding...", file=sys.stderr)
        json_str = base64.b64decode(response_text[4:]).decode("utf8")
        response_text = json_str
    
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
         
    # Check for error response from server
    if isinstance(curriculum_json, dict) and "e" in curriculum_json:
        print(f"DEBUG: Edupage Server Error: {curriculum_json.get('e')}", file=sys.stderr)
        # We return empty listing to avoid crash, but log it
        # Actually better to return empty list of lessons/r for the parser
        return []

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

def fetch_child_data(edupage, child, days_to_fetch):
    print(f"DEBUG: --- Fetching data for {child['name']} ({child['id']}) ---", file=sys.stderr)
    
    # Do NOT set selected_child manually if using switch_to_child, 
    # to allow get_date_plan to see it as None and trigger "my timetable" logic on server?
    # edupage.selected_child = child['id'] 

    
    # Try switching to child context on the server
    if hasattr(edupage, 'switch_to_child'):
        try:
            # ID must be int for edupage-api
            cid_int = int(child['id'])
            print(f"DEBUG: Switching context to child {cid_int}...", file=sys.stderr)
            edupage.switch_to_child(cid_int)
            # Update GSH if it changed? The library might update text_attributes or gsh.
            if hasattr(edupage, "gsh"):
                 print(f"DEBUG: GSH after switch: {edupage.gsh}", file=sys.stderr)
        except Exception as e:
            print(f"DEBUG: switch_to_child failed: {e}", file=sys.stderr)

    # TIMETABLE
    print("DEBUG: Fetching Timetable...", file=sys.stderr)
    lessons = []
    try:
        for day in days_to_fetch:
            print(f"DEBUG: Fetching Timetable for {day}...", file=sys.stderr)
            timetable = edupage.get_my_timetable(day)
            if timetable:
                for l in timetable.lessons:
                    lessons.append(serialize_lesson(l, day))
    except Exception as e:
        print(f"DEBUG: Error fetching timetable for {child['name']}: {e}", file=sys.stderr)

    # HOMEWORK (assignments)
    # ... (Keep existing HW logic or improve?)
    print("DEBUG: Fetching Homework...", file=sys.stderr)
    homeworks = []
    try:
        if hasattr(edupage, "get_homeworks"):
            hws = edupage.get_homeworks() 
            for hw in hws:
                homeworks.append({
                    "id": getattr(hw, "id", None),
                    "title": getattr(hw, "title", "Hausaufgabe"),
                    "subject": getattr(hw, "subject", {}).name if getattr(hw, "subject", None) else "",
                    "dueDate": getattr(hw, "date", ""),
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

    # MESSAGES
    print("DEBUG: Fetching Messages...", file=sys.stderr)
    messages = []
    try:
        # Try both notifications and timeline
        found_msgs = []
        if hasattr(edupage, "get_notifications"):
            found_msgs = edupage.get_notifications()
        
        # Also try "timeline" which might contain Bulletin Board info
        if not found_msgs and hasattr(edupage, "get_timeline"):
             # Need to implement get_timeline if it exists or verify library support
             pass
             
        # Fallback to whatever found_msgs has
        for n in found_msgs: 
            messages.append({
                "title": getattr(n, "title", "Info"),
                "body": getattr(n, "body", "") or getattr(n, "text", ""), # some might use 'text'
                "type": getattr(n, "type", "notice"),
                "date": getattr(n, "timestamp", "")
            })
            
        # Process Timeline Items (Parsed from HTML)
        if hasattr(edupage, "timeline_data"):
            print("DEBUG: Processing extracted timeline data...", file=sys.stderr)
            if edupage.timeline_data:
                print(f"DEBUG: First timeline item sample: {edupage.timeline_data[0]}", file=sys.stderr)
                
            for item in edupage.timeline_data:
                # Filter relevant items
                # Typ: 'sprava' (message), 'nastenka' (noticeboard), 'text' (maybe)
                # We also check 'user' or 'user_meno' to see if it matches the child
                # But typically the feed contains items relevant to the logged in parent/user
                
                # Check for relevancy?
                # The items have "user" field usually like "Rodic-..." or "Ucitel-..." (sender)
                # They don't always explicitly say "for child X". 
                # However, the feed is usually filtered for the viewer.
                # We will include "sprava" and "nastenka" and "homework" (if needed, but we have separate HW)
                
                typ = item.get("typ")
                if typ in ["sprava", "nastenka", "text", "event"]:
                    # Create message object
                    msg = {
                        "title": item.get("user_meno", "Info"), # Use sender as title?
                        "body": item.get("text", "") or item.get("body", ""),
                        "type": typ,
                        "date": item.get("timestamp", "")
                    }
                    
                    # Deduplication check
                    if not any(m["date"] == msg["date"] and m["body"] == msg["body"] for m in messages):
                        messages.append(msg)
                        
    except Exception as e:
         print(f"DEBUG: Error fetching messages: {e}", file=sys.stderr)

    # cleanup: switch back to parent for next iteration
    if hasattr(edupage, 'switch_to_parent'):
        try:
             print("DEBUG: Switching back to parent...", file=sys.stderr)
             edupage.switch_to_parent()
        except Exception as e:
             # Just log, don't fail
             print(f"DEBUG: switch_to_parent failed: {e}", file=sys.stderr)

    return {
        'studentId': child['id'],
        'firstName': child['name'].split()[0], # Simple parse
        'lastName': " ".join(child['name'].split()[1:]),
        'className': child.get('class', 'Unknown'), # Extracted earlier or parse from name
        'timetable': lessons,
        'homework': homeworks,
        'grades': grades_data,
        'messages': messages
    }


def main():
    print("DEBUG: Edupage Bridge Script v1.6 (Multi-Child)", file=sys.stderr)
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing credentials"}))
        sys.exit(1)

    username = sys.argv[1]
    password = sys.argv[2]
    subdomain = sys.argv[3] if len(sys.argv) > 3 else "login1"

    # Parse target date
    target_date_str = sys.argv[4] if len(sys.argv) > 4 else None
    if target_date_str:
        try:
            target_date = datetime.datetime.strptime(target_date_str, "%Y-%m-%d").date()
        except ValueError:
             print(json.dumps({"error": "Invalid date format. Use YYYY-MM-DD"}))
             sys.exit(1)
    else:
        target_date = datetime.date.today()

    # Calculate Start/End of Week (Monday - Sunday)
    start_of_week = target_date - datetime.timedelta(days=target_date.weekday())
    # We will fetch Monday to Friday for the timetable
    days_to_fetch = [start_of_week + datetime.timedelta(days=i) for i in range(5)]

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
    
    result = {
        "students": [],
        "weekStart": start_of_week.isoformat(),
        "weekDates": [d.isoformat() for d in days_to_fetch]
    }

    try:
        # Check if we found children during login
        children = getattr(edupage, "children", [])
        
        if not children:
            print("DEBUG: No children profiles found. Attempting fallback to main profile.", file=sys.stderr)
            # Try fetching as "self" (might fail for parents, but works for students)
            children = [{"id": None, "name": "Myself"}]
            
        for child in children:
            child_data = fetch_child_data(edupage, child, days_to_fetch)
            result["students"].append(child_data)
            
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"DEBUG: Internal Error Traceback:\n{error_details}", file=sys.stderr)
        print(json.dumps({"error": f"Internal Error: {str(e)}", "traceback": error_details}))
        sys.exit(1)

    print(json.dumps(result, default=str))


if __name__ == "__main__":
    main()

