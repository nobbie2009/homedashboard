import sys
from edupage_api import Edupage
from edupage_api.exceptions import BadCredentialsException, CaptchaException
import traceback

def test_login(username, password, subdomain):
    print(f"Testing login for user: {username} on subdomain: {subdomain}")
    edupage = Edupage()
    try:
        edupage.login(username, password, subdomain)
        print("Login SUCCESS!")
        
        # Try fetching data to verify session validity
        print("Fetching user info...")
        # Inspect internal user data (safe way?)
        print(f"Logged in user (internal): {edupage.user}")
        
        print("Fetching timetable...")
        tt = edupage.get_timetable()
        print(f"Timetable fetched. Lessons count: {len(tt.lessons) if tt else 0}")
        
    except BadCredentialsException:
        print("ERROR: BadCredentialsException - Wrong username or password.")
    except CaptchaException:
        print("ERROR: CaptchaException - Captcha required.")
    except Exception:
        print("ERROR: Other Exception:")
        traceback.print_exc()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python debug_login.py <username> <password> [subdomain]")
        sys.exit(1)
        
    u = sys.argv[1]
    p = sys.argv[2]
    s = sys.argv[3] if len(sys.argv) > 3 else "login1"
    
    test_login(u, p, s)
