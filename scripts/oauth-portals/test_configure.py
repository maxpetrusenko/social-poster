import ast
import unittest
from pathlib import Path


CONFIGURE_PATH = Path(__file__).with_name("configure.py")


def configured_callback_uris() -> list[str]:
    tree = ast.parse(CONFIGURE_PATH.read_text())
    for node in tree.body:
        if (
            isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name) and target.id == "CALLBACK_URIS"
                for target in node.targets
            )
        ):
            value = ast.literal_eval(node.value)
            if not isinstance(value, list):
                raise AssertionError("CALLBACK_URIS must be a list")
            return value
    raise AssertionError("CALLBACK_URIS assignment not found")


class CallbackUriConfigurationTests(unittest.TestCase):
    def test_registers_new_legacy_and_local_callbacks(self):
        self.assertEqual(
            configured_callback_uris(),
            [
                "http://localhost:3000/api/auth/callback",
                "https://smmagent.app/api/auth/callback",
                "https://social.maxpetrusenko.com/api/auth/callback",
            ],
        )


if __name__ == "__main__":
    unittest.main()
