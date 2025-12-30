import sys
import json
import datetime
from edupage_api import Edupage
from edupage_api.timetables import Timetables
from edupage_api.utils import RequestUtil

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
    
# Clean up old implementation completely
def fixed_get_date_plan(self, date):
    print(f"DEBUG: fixed_get_date_plan called for {date}", file=sys.stderr)
    
    # 1. Prepare shared data
    gsh = getattr(self.edupage, "gsh", "00000000")
    active_child = getattr(self.edupage, 'active_child_id', None)
    
    # Refresh logic omitted for brevity (eb.php check)
    gpid = None
    try:
        csrf_url = f"https://{self.edupage.subdomain}.edupage.org/dashboard/eb.php?mode=ttday"
        csrf_resp = self.edupage.session.get(csrf_url)
        if "gpid=" in csrf_resp.text:
            gpid = csrf_resp.text.split("gpid=")[1].split("&")[0]
            if "gsh=" in csrf_resp.text:
                gsh = csrf_resp.text.split("gsh=")[1].split('"')[0]
    except:
        pass
    
    # Strategy 1: GCall
    try:
        if gpid:
            # Try plain active_child first? No, Ziak format for gcall.
            child_num = str(active_child).lstrip('-') if active_child else "0"
            user_id_param = f"Ziak-{child_num}" if active_child else self.edupage.get_user_id()
            
            gcall_data = {
                "gpid": str(int(gpid) + 1),
                "gsh": gsh,
                "action": "loadData",
                "user": user_id_param,
                "changes": "{}",
                "date": date.strftime("%Y-%m-%d"),
                "dateto": date.strftime("%Y-%m-%d"),
                "_LJSL": "4096",
            }
            url = f"https://{self.edupage.subdomain}.edupage.org/gcall"
            resp = self.edupage.session.post(url, data=RequestUtil.encode_form_data(gcall_data), headers={"Content-Type": "application/x-www-form-urlencoded"})
            
            if "Insuficient privileg" not in resp.text and ('"r":' in resp.text or '",[' in resp.text):
                # Try parsing
                if '",[' in resp.text:
                     json_str = resp.text.split('",[', 1)[1].rsplit(']', 1)[0]
                     json_str = '[' + json_str + ']'
                     data = json.loads(json_str) 
                     if data.get("dates") and data.get("dates").get(date.strftime("%Y-%m-%d")):
                         print("DEBUG: GCall success!", file=sys.stderr)
                         return data.get("dates").get(date.strftime("%Y-%m-%d")).get("plan")
            else:
                print(f"DEBUG: GCall rejected. Resp: {resp.text[:150]}", file=sys.stderr)
                
    except Exception as e:
        print(f"DEBUG: GCall attempt failed: {e}", file=sys.stderr)

    
    # Strategy 2 & 3: TTViewer
    targets_to_try = []
    if active_child:
        targets_to_try.append(active_child) # "-255"
        targets_to_try.append(str(active_child).lstrip('-')) # "255"
        targets_to_try.append(int(str(active_child).lstrip('-'))) # 255 (int)
        targets_to_try.append(f"Ziak-{str(active_child).lstrip('-')}") # "Ziak-255"
    targets_to_try.append(None)
    
    # Deduplicate (preserving order)
    seen = set()
    unique_targets = []
    for t in targets_to_try:
        t_str = str(t)
        if t_str not in seen:
            unique_targets.append(t)
            seen.add(t_str)
    
    # Function to try TTViewer
    def try_ttviewer_func(func_name, targets):
        for tid in targets:
            try:
                print(f"DEBUG: Trying {func_name} with target={tid} (type {type(tid)})", file=sys.stderr)
                url = f"https://{self.edupage.subdomain}.edupage.org/timetable/server/ttviewer.js?__func={func_name}"
                payload = {
                    "__args": [tid, date.year, date.month, date.day],
                    "__gsh": gsh
                }
                resp = self.edupage.session.post(url, json=payload)
                
                if resp.status_code != 200:
                    print(f"DEBUG: {func_name} HTTP {resp.status_code}", file=sys.stderr)
                    continue
                    
                if "TypeError" in resp.text:
                    print(f"DEBUG: {func_name} TypeError in response", file=sys.stderr)
                    continue
                    
                # Parsing logic
                txt = resp.text
                if txt.startswith("eqz:"):
                     import base64
                     txt = base64.b64decode(txt[4:]).decode("utf8")
                 
                marker = f"{func_name}_res("
                if marker in txt:
                     txt = txt.split(marker)[1].rsplit(")", 1)[0]
                
                try:
                    data = json.loads(txt)
                except:
                    print(f"DEBUG: {func_name} JSON parse error", file=sys.stderr)
                    continue
                    
                if "r" in data:
                    res_data = data["r"]
                    if func_name == "ttviewer_getTTViewerData":
                         # This returns complex structure. 
                         # Try regular > timetable > lessons?
                         pass # Not implemented fully yet, just return success if not empty?
                         # For now, if it didn't error, assume we might be able to use it?
                         # But we need to return standardized format.
                         # Let's skip parsing exacts for getTTViewerData unless we know format.
                         continue 
                    elif func_name == "ttviewer_getDatePlan":
                         print(f"DEBUG: {func_name} success!", file=sys.stderr)
                         return res_data
                else:
                    print(f"DEBUG: {func_name} 'r' missing. Keys: {list(data.keys())}", file=sys.stderr)

            except Exception as e:
                print(f"DEBUG: {func_name} exception: {e}", file=sys.stderr)
        return None

    # Try getTTViewerData (the only function that exists on this server!)
    for tid in unique_targets:
        try:
            print(f"DEBUG: Trying getTTViewerData with target={tid}", file=sys.stderr)
            url = f"https://{self.edupage.subdomain}.edupage.org/timetable/server/ttviewer.js?__func=getTTViewerData"
            payload = {
                "__args": [tid, date.year, date.month, date.day],
                "__gsh": gsh
            }
            resp = self.edupage.session.post(url, json=payload)
            
            if resp.status_code != 200:
                print(f"DEBUG: getTTViewerData HTTP {resp.status_code}", file=sys.stderr)
                continue
                
            if "TypeError" in resp.text or "Error" in resp.text[:50]:
                print(f"DEBUG: getTTViewerData error in response: {resp.text[:100]}", file=sys.stderr)
                continue
            
            # Parse response
            txt = resp.text
            if txt.startswith("eqz:"):
                import base64
                txt = base64.b64decode(txt[4:]).decode("utf8")
            
            if "getTTViewerData_res(" in txt:
                txt = txt.split("getTTViewerData_res(")[1].rsplit(")", 1)[0]
            
            data = json.loads(txt)
            if "r" in data:
                result = data["r"]
                print(f"DEBUG: getTTViewerData success! Keys: {list(result.keys())}", file=sys.stderr)
                
                if isinstance(result, dict):
                    # Log defaults structure
                    if 'defaults' in result:
                        defaults = result['defaults']
                        print(f"DEBUG: defaults: {str(defaults)[:300]}", file=sys.stderr)
                    
                    # Log ALL timetables to find current one
                    if 'regular' in result and 'timetables' in result['regular']:
                        timetables = result['regular']['timetables']
                        print(f"DEBUG: ALL timetables ({len(timetables)} items):", file=sys.stderr)
                        for tt in timetables:
                            print(f"DEBUG:   tt_num={tt.get('tt_num')}, year={tt.get('year')}, hidden={tt.get('hidden')}, text={tt.get('text', '')[:40]}, datefrom={tt.get('datefrom')}", file=sys.stderr)
                        
                        # Find current/active timetable (not hidden, most recent)
                        active_tts = [t for t in timetables if not t.get('hidden', False)]
                        print(f"DEBUG: Active (non-hidden) timetables: {len(active_tts)}", file=sys.stderr)
                        
                        if active_tts:
                            # Sort by year/datefrom to get most recent
                            current_tt = max(active_tts, key=lambda t: (t.get('year', 0), t.get('datefrom', '')))
                            print(f"DEBUG: Current timetable: tt_num={current_tt.get('tt_num')}, text={current_tt.get('text')}", file=sys.stderr)
                            
                            # Now try to fetch this specific timetable's data
                            tt_num = current_tt.get('tt_num')
                            if tt_num:
                                # Try to get timetable data with this tt_num
                                tt_url = f"https://{self.edupage.subdomain}.edupage.org/timetable/server/regulartt.js?__func=regularttGetData"
                                tt_payload = {
                                    "__args": [None, tt_num],
                                    "__gsh": gsh
                                }
                                try:
                                    tt_resp = self.edupage.session.post(tt_url, json=tt_payload)
                                    if tt_resp.status_code == 200 and "Error" not in tt_resp.text[:50]:
                                        tt_txt = tt_resp.text
                                        if "regularttGetData_res(" in tt_txt:
                                            tt_txt = tt_txt.split("regularttGetData_res(")[1].rsplit(")", 1)[0]
                                        tt_data = json.loads(tt_txt)
                                        if "r" in tt_data:
                                            tt_result = tt_data["r"]
                                            print(f"DEBUG: regularttGetData success! Keys: {list(tt_result.keys())}", file=sys.stderr)
                                            
                                            # Explore dbiAccessorRes structure
                                            if 'dbiAccessorRes' in tt_result:
                                                dbi = tt_result['dbiAccessorRes']
                                                print(f"DEBUG: dbiAccessorRes keys: {list(dbi.keys())}", file=sys.stderr)
                                                
                                                if 'tables' in dbi:
                                                    tables = dbi['tables']
                                                    print(f"DEBUG: tables type: {type(tables)}", file=sys.stderr)
                                                    
                                                    if isinstance(tables, list):
                                                        print(f"DEBUG: tables is list of {len(tables)} items", file=sys.stderr)
                                                        # Each item in tables might be a table definition
                                                        # Log ALL table IDs first
                                                        all_table_ids = [t.get('id', '?') for t in tables if isinstance(t, dict)]
                                                        print(f"DEBUG: All table IDs: {all_table_ids}", file=sys.stderr)
                                                        
                                                        # Check for terms/holidays table
                                                        for t in tables:
                                                            if isinstance(t, dict):
                                                                tid = t.get('id', '')
                                                                if tid == 'terms':
                                                                    rows = t.get('data_rows', [])
                                                                    print(f"DEBUG: TERMS table has {len(rows)} rows", file=sys.stderr)
                                                                    for tr in rows[:5]:
                                                                        print(f"DEBUG: Term: {str(tr)[:200]}", file=sys.stderr)
                                                                elif tid == 'weeks':
                                                                    rows = t.get('data_rows', [])
                                                                    print(f"DEBUG: WEEKS table has {len(rows)} rows", file=sys.stderr)
                                                                    for wr in rows[:3]:
                                                                        print(f"DEBUG: Week: {str(wr)[:250]}", file=sys.stderr)
                                                                elif tid == 'days':
                                                                    rows = t.get('data_rows', [])
                                                                    print(f"DEBUG: DAYS table has {len(rows)} rows", file=sys.stderr)
                                                                    for dr in rows[:3]:
                                                                        print(f"DEBUG: Day: {str(dr)[:250]}", file=sys.stderr)
                                                        
                                                        # Log first few items in detail
                                                        for i, item in enumerate(tables[:5]):
                                                            if isinstance(item, dict):
                                                                print(f"DEBUG: tables[{i}] keys: {list(item.keys())[:10]}", file=sys.stderr)
                                                                # Log id/name if present
                                                                if 'id' in item:
                                                                    print(f"DEBUG: tables[{i}]['id']: {item['id']}", file=sys.stderr)
                                                                if 'data_rows' in item:
                                                                    rows = item['data_rows']
                                                                    print(f"DEBUG: tables[{i}]['data_rows'] has {len(rows)} rows", file=sys.stderr)
                                                                    if rows:
                                                                        print(f"DEBUG: First row: {str(rows[0])[:200]}", file=sys.stderr)
                                                            else:
                                                                print(f"DEBUG: tables[{i}]: {str(item)[:100]}", file=sys.stderr)
                                                        
                                                        # Look for cards/lessons table
                                                        cards_table = None
                                                        lessons_table = None
                                                        for t in tables:
                                                            if isinstance(t, dict):
                                                                tid = t.get('id', '')
                                                                if 'cards' in str(tid).lower():
                                                                    cards_table = t
                                                                elif 'lessons' in str(tid).lower():
                                                                    lessons_table = t
                                                        
                                                        if cards_table:
                                                            print(f"DEBUG: Found cards table! Keys: {list(cards_table.keys())}", file=sys.stderr)
                                                            cards = cards_table.get('data_rows', [])
                                                            print(f"DEBUG: Cards has {len(cards)} rows", file=sys.stderr)
                                                            if cards:
                                                                # Log first card structure
                                                                print(f"DEBUG: Sample card: {str(cards[0])[:400]}", file=sys.stderr)
                                                            
                                                            # Find periods and subjects tables for lookups
                                                            periods_lookup = {}
                                                            subjects_lookup = {}
                                                            classes_lookup = {}
                                                            teachers_lookup = {}
                                                            lessons_lookup = {}
                                                            
                                                            for t in tables:
                                                                if isinstance(t, dict):
                                                                    tid = t.get('id', '')
                                                                    rows = t.get('data_rows', [])
                                                                    if tid == 'periods':
                                                                        for r in rows:
                                                                            periods_lookup[r.get('id')] = r
                                                                    elif tid == 'subjects':
                                                                        for r in rows:
                                                                            subjects_lookup[r.get('id')] = r
                                                                    elif tid == 'classes':
                                                                        for r in rows:
                                                                            classes_lookup[r.get('id')] = r
                                                                    elif tid == 'teachers':
                                                                        for r in rows:
                                                                            teachers_lookup[r.get('id')] = r
                                                                    elif tid == 'lessons':
                                                                        for r in rows:
                                                                            lessons_lookup[r.get('id')] = r
                                                            
                                                            print(f"DEBUG: Lookups - periods:{len(periods_lookup)}, subjects:{len(subjects_lookup)}, classes:{len(classes_lookup)}, lessons:{len(lessons_lookup)}", file=sys.stderr)
                                                            
                                                            if lessons_lookup:
                                                                sample_lesson = list(lessons_lookup.values())[0]
                                                                print(f"DEBUG: Sample lesson: {str(sample_lesson)[:300]}", file=sys.stderr)
                                                            
                                                            # Determine which day index we need (0=Mon, 1=Tue, etc)
                                                            day_index = date.weekday()  # 0=Monday
                                                            print(f"DEBUG: Looking for day_index={day_index} (date={date})", file=sys.stderr)
                                                            
                                                            # Get the active child's student ID for filtering
                                                            active_child = getattr(self.edupage, 'active_child_id', None)
                                                            # Get child's name to extract class (e.g., "Johanna Jahn, 1b" -> "1b")
                                                            child_name = getattr(self.edupage, 'active_child_name', None)
                                                            child_class_name = None
                                                            if child_name and ',' in child_name:
                                                                child_class_name = child_name.split(',')[-1].strip().lower()
                                                            
                                                            # Student IDs in lessons are like '-53', child ID is like '-255'
                                                            # Convert to string for comparison
                                                            child_student_id = str(active_child).lstrip('-') if active_child else None
                                                            print(f"DEBUG: Filtering lessons for student ID: {active_child}, class: {child_class_name}", file=sys.stderr)
                                                            
                                                            # Transform cards to lessons for this date
                                                            result_lessons = []
                                                            matched_count = 0
                                                            for card in cards:
                                                                days_str = card.get('days', '00000')
                                                                # days_str is like '10000' for Monday, '01000' for Tuesday
                                                                if len(days_str) > day_index and days_str[day_index] == '1':
                                                                    # This card is for our day!
                                                                    period_id = card.get('period')
                                                                    lesson_id = card.get('lessonid')
                                                                    
                                                                    lesson = lessons_lookup.get(lesson_id, {})
                                                                    
                                                                    # Check if this lesson is for our child
                                                                    student_ids = lesson.get('studentids', [])
                                                                    class_ids = lesson.get('classids', [])
                                                                    
                                                                    # Filter: only include if child's ID is in studentids
                                                                    is_child_lesson = False
                                                                    
                                                                    if student_ids:
                                                                        # Check if child is in studentids
                                                                        if str(active_child) in student_ids or f"-{child_student_id}" in student_ids:
                                                                            is_child_lesson = True
                                                                    elif class_ids and child_class_name:
                                                                        # No studentids, check by class
                                                                        for cid in class_ids:
                                                                            cls = classes_lookup.get(cid, {})
                                                                            cls_name = cls.get('name', '').lower()
                                                                            if cls_name == child_class_name:
                                                                                is_child_lesson = True
                                                                                break
                                                                    
                                                                    if not is_child_lesson:
                                                                        continue  # Skip this lesson
                                                                    
                                                                    matched_count += 1
                                                                    period = periods_lookup.get(period_id, {})
                                                                    
                                                                    # Get subject from lesson (try both subjectid and subjectids)
                                                                    subject_id = lesson.get('subjectid')
                                                                    if not subject_id:
                                                                        subject_ids_list = lesson.get('subjectids', [])
                                                                        subject_id = subject_ids_list[0] if subject_ids_list else None
                                                                    subject = subjects_lookup.get(subject_id, {})
                                                                    
                                                                    # Get class from lesson
                                                                    class_ids = lesson.get('classids', [])
                                                                    class_id = class_ids[0] if class_ids else None
                                                                    cls = classes_lookup.get(class_id, {})
                                                                    
                                                                    # Get teacher from lesson
                                                                    teacher_ids = lesson.get('teacherids', [])
                                                                    teacher_id = teacher_ids[0] if teacher_ids else None
                                                                    teacher = teachers_lookup.get(teacher_id, {})
                                                                    
                                                                    result_lessons.append({
                                                                        'id': card.get('id'),
                                                                        'period': period.get('name', period_id),
                                                                        'starttime': period.get('starttime', ''),
                                                                        'endtime': period.get('endtime', ''),
                                                                        'subject': subject.get('name', lesson.get('name', 'Unknown')),
                                                                        'subject_short': subject.get('short', ''),
                                                                        'class': cls.get('name', ''),
                                                                        'teacher': teacher.get('name', ''),
                                                                        'classroom': ', '.join(card.get('classroomids', []))
                                                                    })
                                                            
                                                            print(f"DEBUG: Found {len(result_lessons)} lessons for {date} (matched {matched_count} by student filter)", file=sys.stderr)
                                                            if result_lessons:
                                                                print(f"DEBUG: First lesson: {result_lessons[0]}", file=sys.stderr)
                                                            
                                                            # Return list of lessons (expected format)
                                                            return result_lessons
                                                        
                                                        if lessons_table:
                                                            print(f"DEBUG: Found lessons table! Keys: {list(lessons_table.keys())}", file=sys.stderr)
                                                            if 'data_rows' in lessons_table:
                                                                return {"_tables": tables, "_tt_num": tt_num, "_lessons": lessons_table.get('data_rows', [])}
                                                        
                                                        # Just return all tables
                                                        print(f"DEBUG: Returning all tables data", file=sys.stderr)
                                                        return {"_tables": tables, "_tt_num": tt_num}
                                                    
                                                    elif isinstance(tables, dict):
                                                        print(f"DEBUG: tables keys: {list(tables.keys())}", file=sys.stderr)
                                                        # ... previous dict handling
                                    else:
                                        print(f"DEBUG: regularttGetData failed: {tt_resp.text[:100]}", file=sys.stderr)
                                except Exception as e:
                                    print(f"DEBUG: regularttGetData exception: {e}", file=sys.stderr)
                
                # Fallback - return what we have
                print(f"DEBUG: Returning raw TTViewer result", file=sys.stderr)
                return {"_raw_ttviewer": result}
                    
        except Exception as e:
            print(f"DEBUG: getTTViewerData exception: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()

    print("DEBUG: All strategies failed.", file=sys.stderr)
    return None


# Apply monkey patch to Login.login
print("DEBUG: Applying monkey patch to Login.login", file=sys.stderr)
Login.login = fixed_login

print("DEBUG: Applying monkey patch to Timetables._Timetables__get_date_plan (Generic GCall)", file=sys.stderr)
Timetables._Timetables__get_date_plan = fixed_get_date_plan

# Also patch get_my_timetable to handle our list format
original_get_my_timetable = Timetables.get_my_timetable

def patched_get_my_timetable(self, date):
    plan = self._Timetables__get_date_plan(date)
    if plan is None:
        return None
    # If plan is already a list (from our custom parsing), return it directly
    if isinstance(plan, list):
        return plan
    # Otherwise use original parsing
    return self._Timetables__parse_timetable(plan)

Timetables.get_my_timetable = patched_get_my_timetable
print("DEBUG: Applying monkey patch to Timetables.get_my_timetable", file=sys.stderr)


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
    
    # Store active child ID for fixed_get_date_plan payload construction
    edupage.active_child_id = child['id']

    # Do NOT set selected_child manually if using switch_to_child, 
    # to allow get_date_plan to see it as None and trigger "my timetable" logic on server?
    # edupage.selected_child = child['id'] 

    # Store active child info for filtering in fixed_get_date_plan
    edupage.active_child_id = child['id']
    edupage.active_child_name = child['name']
    
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
    
    # Thuringia (Thüringen) School Holidays - hardcoded since API doesn't provide them
    # Christmas 2025/26: 22.12.2025 - 03.01.2026
    # Winter 2026: 10.02.2026 - 14.02.2026
    # Easter 2026: 06.04.2026 - 18.04.2026
    # TODO: Fetch from external calendar or configure in admin
    def is_school_holiday(check_date):
        from datetime import date
        holidays = [
            (date(2025, 12, 22), date(2026, 1, 3)),   # Weihnachtsferien 2025/26
            (date(2026, 2, 10), date(2026, 2, 14)),    # Winterferien 2026
            (date(2026, 4, 6), date(2026, 4, 18)),     # Osterferien 2026
        ]
        d = check_date if isinstance(check_date, date) else check_date.date() if hasattr(check_date, 'date') else check_date
        for start, end in holidays:
            if start <= d <= end:
                return True
        return False
    
    try:
        for day in days_to_fetch:
            print(f"DEBUG: Fetching Timetable for {day}...", file=sys.stderr)
            
            # Check if it's a school holiday
            if is_school_holiday(day):
                print(f"DEBUG: {day} is a school holiday - skipping timetable fetch", file=sys.stderr)
                continue
                
            timetable = edupage.get_my_timetable(day)
            
            if timetable is None:
                continue

                
            # Handle new format (list of dicts from our fixed_get_date_plan)
            if isinstance(timetable, list):
                for l in timetable:
                    # Already in dict format, just add date
                    lesson_dict = {
                        "id": l.get('id', ''),
                        "startTime": l.get('starttime', ''),
                        "endTime": l.get('endtime', ''),
                        "date": day.isoformat(),
                        "subject": {"name": l.get('subject', 'Unknown'), "short": l.get('subject_short', '')},
                        "classroom": {"name": l.get('classroom', '')},
                        "teacher": {"name": l.get('teacher', '')},
                        "class": {"name": l.get('class', '')}
                    }
                    lessons.append(lesson_dict)
            # Handle old format (Timetable object with .lessons)
            elif hasattr(timetable, 'lessons'):
                for l in timetable.lessons:
                    lessons.append(serialize_lesson(l, day))
            # Handle dict format (raw TTViewer result)
            elif isinstance(timetable, dict):
                print(f"DEBUG: Timetable is dict with keys: {list(timetable.keys())}", file=sys.stderr)
                # Try to extract lessons from various possible structures
                pass
                
    except Exception as e:
        print(f"DEBUG: Error fetching timetable for {child['name']}: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()

    # HOMEWORK (assignments)
    print("DEBUG: Fetching Homework...", file=sys.stderr)
    homeworks = []
    try:
        if hasattr(edupage, "get_homeworks"):
            hws = edupage.get_homeworks() 
            print(f"DEBUG: Found {len(hws) if hws else 0} homework items", file=sys.stderr)
            for hw in (hws or []):
                try:
                    subject_name = ""
                    if hasattr(hw, "subject") and hw.subject:
                        subject_name = getattr(hw.subject, "name", str(hw.subject))
                    
                    homeworks.append({
                        "id": str(getattr(hw, "id", "")),
                        "title": getattr(hw, "title", "") or getattr(hw, "text", "Hausaufgabe"),
                        "subject": subject_name,
                        "date": str(getattr(hw, "date", "") or getattr(hw, "due_date", "")),
                        "done": bool(getattr(hw, "is_done", False))
                    })
                except Exception as hw_err:
                    print(f"DEBUG: Error parsing homework item: {hw_err}", file=sys.stderr)
    except Exception as e:
        print(f"DEBUG: Error fetching homework: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)

    # GRADES
    print("DEBUG: Fetching Grades...", file=sys.stderr)
    grades_data = []
    try:
        if hasattr(edupage, "get_grades"):
            try:
                grds = edupage.get_grades()
                print(f"DEBUG: Found {len(grds) if grds else 0} grade items", file=sys.stderr)
                for g in (grds or []):
                    try:
                        subject_name = "?"
                        if hasattr(g, "subject") and g.subject:
                            subject_name = getattr(g.subject, "name", str(g.subject))
                        
                        # Handle different grade value formats
                        value = getattr(g, "value", "") or getattr(g, "grade_value", "")
                        if not value:
                            value = getattr(g, "grade_n", "")
                        
                        grades_data.append({
                            "subject": subject_name,
                            "value": str(value),
                            "date": str(getattr(g, "date", "") or getattr(g, "event_date", ""))
                        })
                    except Exception as g_err:
                        print(f"DEBUG: Error parsing grade item: {g_err}", file=sys.stderr)
            except Exception as inner_e:
                print(f"DEBUG: get_grades() call failed: {inner_e}", file=sys.stderr)
                import traceback
                traceback.print_exc(file=sys.stderr)
    except Exception as e:
        print(f"DEBUG: Error in grades section: {e}", file=sys.stderr)


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
             print(f"DEBUG: switch_to_parent failed: {repr(e)}", file=sys.stderr)

    # Determine className from child name (e.g. "Johanna Jahn, 1b" -> "1b")
    class_name = ''
    if ',' in child['name']:
        class_name = child['name'].split(',')[-1].strip()
    
    return {
        'studentId': child['id'],
        'name': child['name'],  # Full name for frontend header
        'firstName': child['name'].split()[0], # Simple parse
        'lastName': " ".join(child['name'].split()[1:]),
        'className': class_name or child.get('class', 'Unknown'),
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

