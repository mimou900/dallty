-- Seed the launch category list, carried over from the retired
-- src/lib/business-schema.ts SALON_CATEGORIES string array, now with
-- icons, bilingual names, and display ordering.
INSERT INTO public.categories (name, name_fr, name_ar, icon, description, display_order) VALUES
  ('Hair Salon', 'Salon de coiffure', 'صالون تصفيف الشعر', 'Scissors', 'Haircuts, styling, and coloring', 0),
  ('Barbershop', 'Barbier', 'صالون حلاقة', 'Users', 'Men''s grooming and haircuts', 1),
  ('Beauty Salon', 'Salon de beauté', 'صالون تجميل', 'Sparkles', 'General beauty treatments', 2),
  ('Nail Salon', 'Salon de manucure', 'صالون أظافر', 'Hand', 'Manicures and pedicures', 3),
  ('Spa', 'Spa', 'سبا', 'Waves', 'Relaxation and spa treatments', 4),
  ('Massage', 'Massage', 'تدليك', 'HeartHandshake', 'Therapeutic and relaxation massage', 5),
  ('Waxing', 'Épilation', 'إزالة الشعر بالشمع', 'Droplet', 'Hair removal by waxing', 6),
  ('Makeup Studio', 'Studio de maquillage', 'استوديو مكياج', 'Paintbrush', 'Makeup application and lessons', 7),
  ('Eyebrows & Lashes', 'Sourcils et cils', 'الحواجب والرموش', 'Eye', 'Brow shaping and lash extensions', 8),
  ('Laser Hair Removal', 'Épilation au laser', 'إزالة الشعر بالليزر', 'Zap', 'Laser-based hair removal', 9),
  ('Skincare', 'Soins de la peau', 'العناية بالبشرة', 'Flower2', 'Facials and skincare treatments', 10),
  ('Permanent Makeup', 'Maquillage permanent', 'مكياج دائم', 'Gem', 'Microblading and permanent cosmetics', 11),
  ('Wellness Center', 'Centre de bien-être', 'مركز العافية', 'Heart', 'Holistic wellness services', 12);
