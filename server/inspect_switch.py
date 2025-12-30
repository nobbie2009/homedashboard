import inspect
from edupage_api import Edupage

try:
    src = inspect.getsource(Edupage.switch_to_child)
    print("Source for Edupage.switch_to_child:")
    print(src)
except Exception as e:
    print(f"Could not get source: {e}")
