import inspect
import sys
import edupage_api.timetables
from edupage_api.timetables import Timetables

print("Searching for RequestUtil in edupage_api modules...")
try:
    import edupage_api.helpers
    print("Found edupage_api.helpers")
    if hasattr(edupage_api.helpers, 'RequestUtil'):
        print("RequestUtil is in edupage_api.helpers")
except ImportError:
    print("edupage_api.helpers not found")

try:
    import edupage_api.utils
    if hasattr(edupage_api.utils, 'RequestUtil'):
        print("RequestUtil is in edupage_api.utils")
except ImportError:
    print("edupage_api.utils not found")

# Check imports of timetables module
print("\nImports in edupage_api.timetables:")
for name, obj in inspect.getmembers(sys.modules['edupage_api.timetables']):
    if name == 'RequestUtil':
        print(f"Found RequestUtil in timetables module: {obj}")
        # Try to find its module
        if hasattr(obj, '__module__'):
             print(f"RequestUtil defined in: {obj.__module__}")

# List all submodules
import pkgutil
import edupage_api
print("\nSubmodules of edupage_api:")
for importer, modname, ispkg in pkgutil.iter_modules(edupage_api.__path__):
    print(modname)
