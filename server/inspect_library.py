import inspect
from edupage_api.timetables import Timetables
import sys

try:
    src = inspect.getsource(Timetables._Timetables__get_date_plan)
    print("Source for _Timetables__get_date_plan:")
    print(src)
except Exception as e:
    print(f"Could not get source: {e}")
    # Try public method
    try:
        src = inspect.getsource(Timetables.get_date_plan)
        print("Source for get_date_plan (wrapper?):")
        print(src)
    except Exception as e2:
        print(f"Could not get source 2: {e2}")
