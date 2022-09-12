import json
import sys
import logging

log = logging.getLogger(__name__)


def compare_without_order(a, b, file_name_a, file_name_b):
    """Compare objects a and b, ignoring order if the types are dicts or sortable arrays
    """
    aType = type(a)
    bType = type(b)
    if aType != bType:
        log.warning("Mismatch: Objects have different types: %s vs %s", aType, bType)
        return False

    if aType == dict:
        if len(a) != len(b):
            log.warning("Mismatch: Dicts have different lengths (%s vs %s). a_keys=%s vs b_keys=%s", len(a), len(b), a.keys(), b.keys())
            return False
        for key in a:
            a_value = a[key]
            b_value = b.get(key)

            if b_value is None:
                log.warning("Mismatch: Key %s present in %s but missing from %s dict with keys %s", key, file_name_a, file_name_b, b.keys())
                return False

            if not compare_without_order(a_value, b_value, file_name_a, file_name_b):
                log.warning("Mismatch: Dict values at key %s do not match", key)
                return False

        return True

    if aType == list:
        if len(a) != len(b):
            log.warning("Mismatch: Arrays have different lengths (%s vs %s)", len(a), len(b))
            return False

        # Try sorting arrays but fall back to the original order if there's no
        # builtin comparison fn
        try:
            sorted_a = sorted(a)
            sorted_b = sorted(b)
        except TypeError:
            sorted_a = a
            sorted_b = b

        for i in range(len(a)):
            aListItem = sorted_a[i]
            bListItem = sorted_b[i]

            if not compare_without_order(aListItem, bListItem, file_name_a, file_name_b):
                log.warning("Mismatch: Array items at position %s do not match", i)
                return False

        return True

    do_objects_match = a == b
    if not do_objects_match:
        log.warning("Values %s and %s do not match", a, b)
    return do_objects_match


def compare_json_files_without_order(file_name_a, file_name_b):
    with open(file_name_a) as fileA:
        file_a_data = json.load(fileA)
    
    with open(file_name_b) as fileB:
        file_b_data = json.load(fileB)

    return compare_without_order(file_a_data, file_b_data, file_name_a, file_name_b)


def main(): 
    if (len(sys.argv) != 3):
        raise ValueError("Must provide 2 file names to compare")
    
    do_snapshots_match = compare_json_files_without_order(sys.argv[1], sys.argv[2])

    if not do_snapshots_match:
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
