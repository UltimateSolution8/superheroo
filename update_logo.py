from PIL import Image

def composite_logo():
    try:
        # Load the original hero image
        hero = Image.open('assets/hero-namaste-transparent.png').convert('RGBA')
        # Load the clean logo
        logo = Image.open('assets/superlogo.png').convert('RGBA')
        
        # Resize logo to fit nicely on the pocket (approx 90px wide)
        logo_width = 80
        aspect = logo.height / logo.width
        logo = logo.resize((logo_width, int(logo_width * aspect)), Image.Resampling.LANCZOS)
        
        # Apply slight transparency to blend it realistically with the fabric
        alpha = logo.split()[3]
        alpha = alpha.point(lambda p: p * 0.85) # 85% opacity
        logo.putalpha(alpha)
        
        # Position on the left chest (right side of image since he faces us)
        # Assuming the image is ~800x1000. Left chest is around x=60%, y=35%
        # The hero namaste image is 1024x1024.
        x = int(hero.width * 0.58)
        y = int(hero.height * 0.38)
        
        # Create a new blank layer
        layer = Image.new('RGBA', hero.size, (0, 0, 0, 0))
        layer.paste(logo, (x, y))
        
        # Composite
        final = Image.alpha_composite(hero, layer)
        final.save('assets/hero-namaste-transparent.png')
        print("Logo composited perfectly on pocket area!")
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    composite_logo()
