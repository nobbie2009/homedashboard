import sys
import json
import datetime
from edupage_api import Edupage
from edupage_api.exceptions import BadCredentialsException, CaptchaException

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
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing credentials"}))
        sys.exit(1)

    username = sys.argv[1]
    password = sys.argv[2]
    subdomain = sys.argv[3] if len(sys.argv) > 3 else None

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
        print(json.dumps({"error": f"Fetch error: {str(e)}"}))
        sys.exit(1)

    print(json.dumps(result))

if __name__ == "__main__":
    main()
