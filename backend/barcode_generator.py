"""
Pure Python Code 128 Barcode Generator.
Generates clean, scalable, standalone SVG vector barcodes for Code 128 (Subset B).
Zero external dependencies.
"""

from typing import List

# Code 128 character patterns: list of bar/space widths (sum of 6 digits is 11, stop is 13)
# Format: string of digits representing alternating bar and space widths
PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", # 0-9
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", # 10-19
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", # 20-29
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", # 30-39
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", # 40-49
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", # 50-59
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", # 60-69
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", # 70-79
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", # 80-89
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", # 90-99
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112" # 100-106 (106 is STOP: 7 digits)
]

START_B = 104
STOP = 106

def encode_code128_b(text: str) -> List[int]:
    """Encodes ASCII string using Code 128 Subset B values."""
    values = [START_B]
    for ch in text:
        ascii_val = ord(ch)
        if 32 <= ascii_val <= 126:
            values.append(ascii_val - 32)
        else:
            values.append(0)  # fallback to space
    
    # Calculate checksum: (start_val + sum(i * val_i)) % 103
    checksum = values[0]
    for idx, val in enumerate(values[1:], start=1):
        checksum += idx * val
    values.append(checksum % 103)
    values.append(STOP)
    return values

def generate_code128_svg(
    text: str, 
    height: int = 48, 
    module_width: float = 1.35, 
    include_text: bool = True,
    text_size: int = 10
) -> str:
    """
    Generates an SVG string representation of the Code 128 barcode.
    """
    values = encode_code128_b(text)
    
    # Build modules (1 = bar, 0 = space)
    modules: List[int] = []
    for val in values:
        pattern = PATTERNS[val]
        is_bar = True
        for width_str in pattern:
            width = int(width_str)
            modules.extend([1 if is_bar else 0] * width)
            is_bar = not is_bar
            
    quiet_zone = 10
    total_modules = len(modules) + (quiet_zone * 2)
    svg_width = total_modules * module_width
    svg_height = height + (16 if include_text else 0)
    
    rects: List[str] = []
    curr_x = quiet_zone * module_width
    
    # Draw bars
    bar_height = height - (14 if include_text else 0)
    for m in modules:
        if m == 1:
            rects.append(f'<rect x="{curr_x:.2f}" y="2" width="{module_width:.2f}" height="{bar_height}" fill="#000000" />')
        curr_x += module_width
        
    text_elem = ""
    if include_text:
        text_y = height + 8
        center_x = svg_width / 2
        text_elem = (
            f'<text x="{center_x:.2f}" y="{text_y}" font-family="monospace, Courier, sans-serif" '
            f'font-size="{text_size}" font-weight="700" letter-spacing="1.5" text-anchor="middle" '
            f'fill="#000000">{text}</text>'
        )
        
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_width:.2f} {svg_height}" '
        f'width="{svg_width:.2f}" height="{svg_height}">\n'
        f'  <rect width="100%" height="100%" fill="#ffffff" />\n'
        f'  {"".join(rects)}\n'
        f'  {text_elem}\n'
        f'</svg>'
    )
    return svg

if __name__ == "__main__":
    svg = generate_code128_svg("MRG-2026-000001-C1")
    print(f"Generated SVG: {len(svg)} chars")
