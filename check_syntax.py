import re

def check_balance(filename):
    with open(filename, 'r') as f:
        lines = f.readlines()

    stack = []
    
    # We are looking for the error reported at line 1702
    # But we want to find where the problem STARTED.
    # We'll valid brackets/braces/parens.
    
    mapping = {')': '(', ']': '[', '}': '{'}
    
    for i, line in enumerate(lines):
        line_num = i + 1
        
        # Strip strings and comments to avoid false positives
        # This is a naive strip
        clean_line = line
        
        # Remove single line comments
        if '//' in clean_line:
            clean_line = clean_line.split('//')[0]
            
        for char in clean_line:
            if char in '([{':
                stack.append((char, line_num))
            elif char in ')]}':
                if not stack:
                    print(f"Excess closing {char} at line {line_num}")
                else:
                    opener, open_line = stack.pop()
                    expected = mapping[char]
                    if opener != expected:
                        print(f"Mismatched {char} at line {line_num}. Expected {expected} from line {open_line}")
                        return

    if stack:
        print(f"Unclosed elements: {stack[-1]}")

check_balance('src/pages/faculty/Faculty.tsx')
