from PIL import Image

def remove_white_bg(img_path, out_path, tolerance=220):
    img = Image.open(img_path).convert("RGBA")
    data = img.getdata()
    new_data = []
    for item in data:
        # If pixel is close to white, make it transparent
        if item[0] > tolerance and item[1] > tolerance and item[2] > tolerance:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
    img.putdata(new_data)
    img.save(out_path, "PNG")

remove_white_bg("assets/hero-namaste-indian.png", "assets/hero-namaste-transparent.png")
