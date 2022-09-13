import json
import sys
import logging

log = logging.getLogger(__name__)


def do_values_match(a, b, file_name_a, file_name_b):
    """Compare a and b recursively, logging info about any mismatch found
    """
    aType = type(a)
    bType = type(b)
    if aType != bType:
        log.warning("Mismatch: Values have different types: %s vs %s", aType, bType)
        return False

    if aType == dict:
        if len(a) != len(b):
            log.warning(
                "Mismatch: Dicts have different lengths (%s vs %s). a_keys=%s vs b_keys=%s",
                len(a),
                len(b),
                a.keys(),
                b.keys(),
            )
            return False
        for key in a:
            a_value = a[key]
            b_value = b.get(key)

            if b_value is None:
                log.warning(
                    "Mismatch: Key %s present in %s but missing from %s dict with keys %s",
                    key,
                    file_name_a,
                    file_name_b,
                    b.keys(),
                )
                return False

            if not do_values_match(a_value, b_value, file_name_a, file_name_b):
                log.warning("Mismatch: Dict values at key %s do not match", key)
                return False

        return True

    if aType == list:
        if len(a) != len(b):
            log.warning(
                "Mismatch: Arrays have different lengths (%s vs %s)", len(a), len(b)
            )
            return False

        for i in range(len(a)):
            aListItem = a[i]
            bListItem = b[i]

            if not do_values_match(aListItem, bListItem, file_name_a, file_name_b):
                log.warning("Mismatch: Array items at position %s do not match", i)
                return False

        return True

    are_values_equal = a == b
    if not are_values_equal:
        log.warning("Values %s and %s do not match", a, b)
    return are_values_equal


def do_json_files_match(file_name_a, file_name_b):
    with open(file_name_a) as fileA:
        file_a_data = json.load(fileA)

    with open(file_name_b) as fileB:
        file_b_data = json.load(fileB)

    return do_values_match(file_a_data, file_b_data, file_name_a, file_name_b)


def main():
    if len(sys.argv) != 3:
        raise ValueError("Must provide 2 file names to compare")

    do_snapshots_match = do_json_files_match(sys.argv[1], sys.argv[2])

    if not do_snapshots_match:
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
