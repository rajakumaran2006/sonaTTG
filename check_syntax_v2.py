import re

def check_balance(filename):
    with open(filename, 'r') as f:
        content = f.read()

    stack = []
    line_num = 1
    col_num = 1
    in_string = False
    string_char = ''
    in_comment = False # /* */
    in_line_comment = False //
    
    mapping = {')': '(', ']': '[', '}': '{'}
    
    i = 0
    while i < len(content):
        char = content[i]
        
        if char == '\n':
            line_num += 1
            col_num = 1
            in_line_comment = False
            i += 1
            continue
            
        if in_line_comment:
            i += 1
            continue
            
        if in_comment:
            if content[i:i+2] == '*/':
                in_comment = False
                i += 2
                col_num += 2
            else:
                i += 1
                col_num += 1
            continue
            
        if in_string:
            if char == string_char:
                # check for escape
                escaped = False
                if i > 0 and content[i-1] == '\\':
                     # handle case like \\"
                     cnt = 0
                     j = i-1
                     while j >= 0 and content[j] == '\\':
                         cnt += 1
                         j -= 1
                     if cnt % 2 == 1:
                         escaped = True
                
                if not escaped:
                    in_string = False
            i += 1
            col_num += 1
            continue
            
        # Check for comments start
        if content[i:i+2] == '//':
            in_line_comment = True
            i += 2
            col_num += 2
            continue
            
        if content[i:i+2] == '/*':
            in_comment = True
            i += 2
            col_num += 2
            continue
            
        # Check for string start
        if char in '"\'`':
            in_string = True
            string_char = char
            i += 1
            col_num += 1
            continue
            
        # Check braces
        if char in '([{':
            stack.append((char, line_num, col_num))
        elif char in ')]}':
            if not stack:
                print(f"Excess closing {char} at line {line_num}:{col_num}")
            else:
                opener, open_line, open_col = stack.pop()
                expected = mapping[char]
                if opener != expected:
                    print(f"Mismatched {char} at line {line_num}:{col_num}. Expected {expected} from line {open_line}:{open_col}")
                    return

        i += 1
        col_num += 1

    if stack:
        print(f"Unclosed elements: {stack[-1]}")

check_balance('src/pages/faculty/Faculty.tsx')
