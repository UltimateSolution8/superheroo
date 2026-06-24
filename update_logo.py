from PIL import Image

def composite_logo():
    try:
        # Load the hero image
        hero = Image.open('assets/hero-namaste-transparent.png').convert('RGBA')
        # Load the clean logo
        logo = Image.open('assets/superlogo.png').convert('RGBA')
        
        # Resize logo to fit nicely on the chest (approx 180px wide)
        logo_width = 180
        aspect = logo.height / logo.width
        logo = logo.resize((logo_width, int(logo_width * aspect)), Image.Resampling.LANCZOS)
        
        # We need to position it on the chest.
        # Let's say center horizontally, and around 40% down vertically.
        # Since it's a specific image, we can just guess the coordinates:
        x = int((hero.width - logo.width) / 2) + 20 # offset a bit
        y = int(hero.height * 0.45)
        
        # Create a new blank layer the size of the hero image
        layer = Image.new('RGBA', hero.size, (0, 0, 0, 0))
        layer.paste(logo, (x, y))
        
        # Composite
        final = Image.alpha_composite(hero, layer)
        final.save('assets/hero-namaste-transparent.png')
        print("Logo composited successfully!")
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    composite_logo()
