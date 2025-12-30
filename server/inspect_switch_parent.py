import inspect
from edupage_api.parent import Parent

try:
    src = inspect.getsource(Parent.switch_to_child)
    print("Source for Parent.switch_to_child:")
    print(src)
except Exception as e:
    print(f"Could not get source: {e}")
