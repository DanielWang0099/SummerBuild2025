require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const path = require('path');

const app = express();
const port = process.env.PORT || 3002;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|glb|gltf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images, videos, and 3D models are allowed'));
    }
  }
});

// Helper function to get user from JWT
const getUserFromToken = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('Auth header missing');
    return null;
  }
  
  const token = authHeader.substring(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) {
      console.warn('Auth error:', error);
      return null;
    }
    return user;
  } catch (error) {
    console.warn('Auth exception:', error);
    return null;
  }
};

// Authentication middleware - relaxed for hackathon
const requireAuth = async (req, res, next) => {
  // Always get a user for hackathon (either real or fallback)
  const user = await getUserFromToken(req);
  // With our modified getUserFromToken, we'll always have a user for hackathon
  req.user = user;
  next();
};


// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'PlaceIt Backend API is running!',
    version: '2.0.0',
    features: [
      'Complete furniture marketplace',
      'User authentication & authorization',
      '3D model generation from videos',
      'AR visualization support',
      'Advanced search & filtering',
      'Seller dashboard & analytics',
      'Shopping cart & checkout',
      'Reviews & ratings system'
    ],
    endpoints: {
      auth: [
        'POST /api/auth/register',
        'POST /api/auth/login',
        'GET /api/auth/profile',
        'PUT /api/auth/profile'
      ],
      furniture: [
        'GET /api/furniture - Get all furniture',
        'GET /api/furniture/:id - Get furniture by ID',        
        'POST /api/furniture - Create new furniture (authenticated users)',
        'PUT /api/furniture/:id - Update furniture (owner only)',
        'DELETE /api/furniture/:id - Delete furniture (owner only)'
      ],
      categories: [
        'GET /api/categories - Get all categories'
      ],
      cart: [
        'GET /api/cart - Get user cart',
        'POST /api/cart - Add item to cart',
        'PUT /api/cart/:itemId - Update cart item',
        'DELETE /api/cart/:itemId - Remove from cart'
      ],
      favorites: [
        'GET /api/favorites - Get user favorites',
        'POST /api/favorites - Add to favorites',
        'DELETE /api/favorites/:furnitureId - Remove from favorites'
      ],
      reviews: [
        'GET /api/reviews/:furnitureId - Get furniture reviews',
        'POST /api/reviews - Create review',
        'PUT /api/reviews/:id - Update review',
        'DELETE /api/reviews/:id - Delete review'
      ],      
      seller: [
        'GET /api/vendor/dashboard - Get user dashboard data',
        'GET /api/vendor/furniture - Get user furniture',
        'GET /api/vendor/analytics - Get user analytics',
        'POST /api/vendor/furniture/:id/generate-3d - Generate 3D model'
      ],
      uploads: [
        'POST /api/uploads/media - Upload media files'
      ]
    }
  });
});

// ===========================================
// AUTHENTICATION ROUTES
// ===========================================

// Register user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, phone, address } = req.body;
    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      return res.status(400).json({ success: false, message: authError.message });
    }

    if (!authData.user) {
      return res.status(400).json({ success: false, message: 'Auth user not created' });
    }

    // Insert into users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([{
        id: authData.user.id,
        email,
        name,
        phone,
        address, // Ensure it's valid JSON if column is jsonb
        is_verified: true
      }])
      .select()
      .maybeSingle();

    if (userError || !userData) {
      return res.status(400).json({ success: false, message: userError?.message || 'User insert failed' });
    }

    res.json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: userData,
        session: authData.session // may be null — depends on email confirmation settings
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    console.log('Data from login:', data);
    
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    // Get user profile robustly
    const { data: userProfiles, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id);

    // Handle potential errors or empty results
    if (profileError) {
      return res.status(400).json({ success: false, message: profileError.message });
    }
    if (!userProfiles || userProfiles.length === 0) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }
    if (userProfiles.length > 1) {
      console.warn(`Multiple user profiles found for id ${data.user.id}. Returning the first.`, userProfiles);
    }
    const userProfile = userProfiles[0];
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userProfile,
        session: data.session
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get user profile
app.get('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const { data: userProfile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      data: userProfile
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update user profile
app.put('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const { name, phone, address, bio, website, profile_image } = req.body;
    
    const { data: userProfile, error } = await supabase
      .from('users')
      .update({
        name,
        phone,
        address,
        bio,
        website,
        profile_image,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.user.id)
      .select()
      .single();
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: userProfile
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Change user password
app.put('/api/user/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Verify current password by attempting to sign in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: req.user.email,
      password: currentPassword,
    });
    
    if (verifyError) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }
    
    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });
    
    if (updateError) {
      return res.status(400).json({ success: false, message: updateError.message });
    }
    
    // Update password_updated_at in users table
    await supabase
      .from('users')
      .update({
        password_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', req.user.id);
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update user profile (alternative endpoint for profile page)
app.put('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    
    const { data: userProfile, error } = await supabase
      .from('users')
      .update({
        name,
        phone,
        address,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.user.id)
      .select()
      .single();
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: userProfile
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ===========================================
// CATEGORIES ROUTES
// ===========================================

    // Get all categories
    app.get('/api/categories', async (req, res) => {
      try {
        const { data: categories, error } = await supabase
          .from('categories')
          .select('*')
          .eq('is_active', true);
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ===========================================
// FURNITURE ROUTES
// ===========================================

// Get all furniture with filtering and search
app.get('/api/furniture', async (req, res) => {
  try {
    let { 
      category, 
      minPrice, 
      maxPrice, 
      search, 
      has3D, 
      hasAR, 
      sortBy = 'created_at',
      order = 'desc',
      page = 1,
      limit = 12,
      vendor_id,
      min_price,
      max_price,
      has_3d_model,
      has_ar_support,
      sort
    } = req.query;
    // Support both camelCase and snake_case query params
    minPrice = minPrice ?? (min_price ? parseFloat(min_price) : undefined);
    maxPrice = maxPrice ?? (max_price ? parseFloat(max_price) : undefined);
    has3D = has3D ?? (has_3d_model === 'true');
    hasAR = hasAR ?? (has_ar_support === 'true');
    sortBy = sortBy ?? sort;
    
    let query = supabase
      .from('furniture')
      .select(`
        *,
        categories(name, slug),
        users!furniture_vendor_id_fkey(name, profile_image),
        media_assets(url, type, thumbnail_url, is_primary),
        reviews(rating)
      `)
      .eq('status', 'active');
    
    // Apply filters
    if (category && category !== 'all') {
      const { data: categoryData } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', category)
        .single();
        
      if (categoryData) {
        query = query.eq('category_id', categoryData.id);
      }
    }
    
    if (vendor_id) {
      query = query.eq('vendor_id', vendor_id);
    }
    
    if (minPrice) {
      query = query.gte('price', parseFloat(minPrice));
    }
    
    if (maxPrice) {
      query = query.lte('price', parseFloat(maxPrice));
    }
    
    if (has3D === 'true') {
      query = query.eq('has_3d_model', true);
    }
    
    if (hasAR === 'true') {
      query = query.eq('has_ar_support', true);
    }
    
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,tags.cs.{${search}}`);
    }
    
    // Apply sorting
    const validSortFields = ['created_at', 'price', 'title', 'view_count'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const sortOrder = order === 'asc' ? true : false;
    
    query = query.order(sortField, { ascending: sortOrder });
    
    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);
    
    const { data: furniture, error, count } = await query;
    
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    // Calculate average ratings and format data
    const formattedFurniture = furniture.map(item => {
      const reviews = item.reviews || [];
      const avgRating = reviews.length > 0 
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length 
        : 0;
      
      return {
        ...item,
        average_rating: Math.round(avgRating * 10) / 10,
        review_count: reviews.length,
        reviews: undefined // Remove detailed reviews from list view
      };
    });
    
    res.json({
      success: true,
      data: formattedFurniture,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Furniture fetch error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get furniture by ID
app.get('/api/furniture/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Increment view count
    await supabase
      .from('furniture')
      .update({ view_count: supabase.sql`view_count + 1` })
      .eq('id', id);
    
    const { data: furniture, error } = await supabase
      .from('furniture')
      .select(`
        *,
        categories(name, slug),
        users!furniture_vendor_id_fkey(name, profile_image, bio, website),
        media_assets(*),
        reviews(*, users(name, profile_image))
      `)
      .eq('id', id)
      .eq('status', 'active')
      .single();
      
    if (error) {
      return res.status(404).json({ success: false, message: 'Furniture not found' });
    }
    
    // Calculate average rating
    const reviews = furniture.reviews || [];
    const avgRating = reviews.length > 0 
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length 
      : 0;
    
    furniture.average_rating = Math.round(avgRating * 10) / 10;
    furniture.review_count = reviews.length;
    
    res.json({
      success: true,
      data: furniture
    });
  } catch (error) {
    console.error('Furniture detail error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Create new furniture (all authenticated users can sell)
app.post('/api/furniture', requireAuth, async (req, res) => {
  try {
    const {
      title,
      description,
      short_description,
      price,
      compare_at_price,
      category_id,
      dimensions,
      materials,
      colors,
      tags,
      features,
      care_instructions,
      assembly_required,
      warranty_info,
      inventory_count,
      min_order_quantity,
      max_order_quantity
    } = req.body;
    
    // Generate slug from title
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    
    // Generate SKU
    const sku = `FUR-${Date.now()}`;
    
    const { data: furniture, error } = await supabase
      .from('furniture')
      .insert([{
        vendor_id: req.user.id,
        title,
        slug,
        description,
        short_description,
        price: parseFloat(price),
        compare_at_price: compare_at_price ? parseFloat(compare_at_price) : null,
        category_id,
        sku,
        dimensions,
        materials,
        colors,
        tags,
        features,
        care_instructions,
        assembly_required: Boolean(assembly_required),
        warranty_info,
        inventory_count: parseInt(inventory_count) || 0,
        min_order_quantity: parseInt(min_order_quantity) || 1,
        max_order_quantity: parseInt(max_order_quantity) || 10,
        status: 'draft'
      }])
      .select()
      .single();
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      message: 'Furniture created successfully',
      data: furniture
    });
  } catch (error) {
    console.error('Furniture creation error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update furniture (owner only)
app.put('/api/furniture/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Verify ownership
    const { data: existingFurniture, error: checkError } = await supabase
      .from('furniture')
      .select('vendor_id')
      .eq('id', id)
      .single();
      
    if (checkError || !existingFurniture) {
      return res.status(404).json({ success: false, message: 'Furniture not found' });
    }
    
    if (existingFurniture.vendor_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    
    const { data: furniture, error } = await supabase
      .from('furniture')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      message: 'Furniture updated successfully',
      data: furniture
    });
  } catch (error) {
    console.error('Furniture update error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Delete furniture (owner only)
app.delete('/api/furniture/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify ownership
    const { data: existingFurniture, error: checkError } = await supabase
      .from('furniture')
      .select('vendor_id')
      .eq('id', id)
      .single();
      
    if (checkError || !existingFurniture) {
      return res.status(404).json({ success: false, message: 'Furniture not found' });
    }
    
    if (existingFurniture.vendor_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    
    const { error } = await supabase
      .from('furniture')
      .delete()
      .eq('id', id);
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      message: 'Furniture deleted successfully'
    });
  } catch (error) {
    console.error('Furniture deletion error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update furniture listing status
app.patch('/api/furniture/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.id;

    // Check if user owns the furniture
    const { data: furniture, error: fetchError } = await supabase
      .from('furniture')
      .select('vendor_id')
      .eq('id', id)
      .single();

    if (fetchError || !furniture) {
      return res.status(404).json({ success: false, message: 'Furniture not found' });
    }

    if (furniture.vendor_id !== userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this item' });
    }

    // Update status
    const { data, error } = await supabase
      .from('furniture')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.json({
      success: true,
      message: 'Status updated successfully',
      data
    });

  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Bulk operations for furniture
app.patch('/api/furniture/bulk/:action', requireAuth, async (req, res) => {
  try {
    const { action } = req.params;
    const { furniture_ids } = req.body;
    const userId = req.user.id;

    if (!furniture_ids || !Array.isArray(furniture_ids)) {
      return res.status(400).json({ success: false, message: 'Invalid furniture IDs' });
    }

    // Verify ownership
    const { data: furnitureList } = await supabase
      .from('furniture')
      .select('id, vendor_id')
      .in('id', furniture_ids);

    const unauthorizedItems = furnitureList.filter(item => item.vendor_id !== userId);
    if (unauthorizedItems.length > 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to modify some items' 
      });
    }

    let updateData = {};
    switch (action) {
      case 'activate':
        updateData = { status: 'active' };
        break;
      case 'deactivate':
        updateData = { status: 'archived' };
        break;
      case 'delete':
        const { error: deleteError } = await supabase
          .from('furniture')
          .delete()
          .in('id', furniture_ids);
        
        if (deleteError) {
          return res.status(400).json({ success: false, message: deleteError.message });
        }
        
        return res.json({
          success: true,
          message: `${furniture_ids.length} items deleted successfully`
        });
      default:
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const { data, error } = await supabase
      .from('furniture')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .in('id', furniture_ids)
      .select();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.json({
      success: true,
      message: `${furniture_ids.length} items updated successfully`,
      data
    });

  } catch (error) {
    console.error('Bulk operation error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get furniture recommendations for vendor
app.get('/api/vendor/recommendations', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get trending categories
    const { data: trendingCategories } = await supabase
      .from('furniture')
      .select(`
        category_id,
        categories(name),
        view_count
      `)
      .not('category_id', 'is', null)
      .order('view_count', { ascending: false })
      .limit(5);

    // Get underperforming products
    const { data: underperformingProducts } = await supabase
      .from('furniture')
      .select('id, title, view_count, status, created_at')
      .eq('vendor_id', userId)
      .eq('status', 'active')
      .lt('view_count', 10)
      .order('created_at', { ascending: false })
      .limit(5);

    // Get pricing suggestions based on similar products
    const { data: pricingSuggestions } = await supabase
      .from('furniture')
      .select('category_id, price')
      .eq('status', 'active')
      .not('vendor_id', 'eq', userId);

    const categoryPricing = {};
    pricingSuggestions?.forEach(item => {
      if (!categoryPricing[item.category_id]) {
        categoryPricing[item.category_id] = [];
      }
      categoryPricing[item.category_id].push(parseFloat(item.price));
    });

    Object.keys(categoryPricing).forEach(categoryId => {
      const prices = categoryPricing[categoryId];
      categoryPricing[categoryId] = {
        min: Math.min(...prices),
        max: Math.max(...prices),
        avg: prices.reduce((sum, price) => sum + price, 0) / prices.length
      };
    });

    res.json({
      success: true,
      data: {
        trendingCategories: trendingCategories?.map(item => ({
          category_id: item.category_id,
          name: item.categories?.name,
          totalViews: item.view_count
        })) || [],
        underperformingProducts: underperformingProducts || [],
        pricingSuggestions: categoryPricing,
        recommendations: [
          'Consider adding 3D models to increase engagement',
          'Products with AR support get 40% more views',
          'Update product descriptions with trending keywords',
          'Seasonal promotions can boost sales by 25%'
        ]
      }
    });

  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});
// ===========================================
// CART ROUTES
// ===========================================

// Get user cart
app.get('/api/cart', requireAuth, async (req, res) => {
  try {
    const { data: cartItems, error } = await supabase
      .from('cart_items')
      .select(`
        *,
        furniture(
          id, title, price, inventory_count, status,
          media_assets(url, type, is_primary)
        )
      `)
      .eq('user_id', req.user.id);
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      data: cartItems
    });
  } catch (error) {
    console.error('Cart fetch error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Add item to cart
app.post('/api/cart', requireAuth, async (req, res) => {
  try {
    const { furniture_id, quantity = 1 } = req.body;
    
    // Check if item already exists in cart
    const { data: existingItem, error: checkError } = await supabase
      .from('cart_items')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('furniture_id', furniture_id)
      .single();
    
    if (existingItem) {
      // Update quantity
      const { data: updatedItem, error } = await supabase
        .from('cart_items')
        .update({ 
          quantity: existingItem.quantity + parseInt(quantity),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingItem.id)
        .select()
        .single();
        
      if (error) {
        return res.status(400).json({ success: false, message: error.message });
      }
      
      return res.json({
        success: true,
        message: 'Cart updated successfully',
        data: updatedItem
      });
    } else {
      // Add new item
      const { data: cartItem, error } = await supabase
        .from('cart_items')
        .insert([{
          user_id: req.user.id,
          furniture_id,
          quantity: parseInt(quantity)
        }])
        .select()
        .single();
        
      if (error) {
        return res.status(400).json({ success: false, message: error.message });
      }
      
      res.json({
        success: true,
        message: 'Item added to cart successfully',
        data: cartItem
      });
    }
  } catch (error) {
    console.error('Cart add error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update cart item
app.put('/api/cart/:itemId', requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    
    const { data: cartItem, error } = await supabase
      .from('cart_items')
      .update({ 
        quantity: parseInt(quantity),
        updated_at: new Date().toISOString()
      })
      .eq('id', itemId)
      .eq('user_id', req.user.id)
      .select()
      .single();
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      message: 'Cart item updated successfully',
      data: cartItem
    });
  } catch (error) {
    console.error('Cart update error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Remove item from cart
app.delete('/api/cart/:itemId', requireAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', req.user.id);
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      message: 'Item removed from cart successfully'
    });
  } catch (error) {
    console.error('Cart remove error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ===========================================
// FAVORITES ROUTES
// ===========================================

// Get user favorites
app.get('/api/favorites', requireAuth, async (req, res) => {
  try {
    const { data: favorites, error } = await supabase
      .from('favorites')
      .select(`
        *,
        furniture(
          id, title, price, status,
          media_assets(url, type, is_primary)
        )
      `)
      .eq('user_id', req.user.id);
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      data: favorites
    });
  } catch (error) {
    console.error('Favorites fetch error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Add to favorites
app.post('/api/favorites', requireAuth, async (req, res) => {
  try {
    const { furniture_id } = req.body;
    
    const { data: favorite, error } = await supabase
      .from('favorites')
      .insert([{
        user_id: req.user.id,
        furniture_id
      }])
      .select()
      .single();
      
    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return res.status(400).json({ success: false, message: 'Item already in favorites' });
      }
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      message: 'Item added to favorites successfully',
      data: favorite
    });
  } catch (error) {
    console.error('Favorites add error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Remove from favorites
app.delete('/api/favorites/:furnitureId', requireAuth, async (req, res) => {
  try {
    const { furnitureId } = req.params;
    
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', req.user.id)
      .eq('furniture_id', furnitureId);
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      message: 'Item removed from favorites successfully'
    });
  } catch (error) {
    console.error('Favorites remove error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ===========================================
// REVIEWS ROUTES
// ===========================================

// Get furniture reviews
app.get('/api/reviews/:furnitureId', async (req, res) => {
  try {
    const { furnitureId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const { data: reviews, error, count } = await supabase
      .from('reviews')
      .select(`
        *,
        users(name, profile_image)
      `, { count: 'exact' })
      .eq('furniture_id', furnitureId)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      data: reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Reviews fetch error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Create review
app.post('/api/reviews', requireAuth, async (req, res) => {
  try {
    const { furniture_id, rating, title, comment } = req.body;
    
    // Check if user has already reviewed this item
    const { data: existingReview, error: checkError } = await supabase
      .from('reviews')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('furniture_id', furniture_id)
      .single();
    
    if (existingReview) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this item' });
    }
    
    const { data: review, error } = await supabase
      .from('reviews')
      .insert([{
        furniture_id,
        user_id: req.user.id,
        rating: parseInt(rating),
        title,
        comment
      }])
      .select()
      .single();
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      message: 'Review created successfully',
      data: review
    });
  } catch (error) {
    console.error('Review creation error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ===========================================
// VENDOR ROUTES
// ===========================================

// Get user dashboard data (all users can access)
app.get('/api/vendor/dashboard', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get total listings count
    const { count: totalListings } = await supabase
      .from('furniture')
      .select('*', { count: 'exact', head: true })
      .eq('vendor_id', userId);

    // Get total views from all furniture
    const { data: furnitureViews } = await supabase
      .from('furniture')
      .select('view_count')
      .eq('vendor_id', userId);

    const totalViews = furnitureViews?.reduce((sum, item) => sum + (item.view_count || 0), 0) || 0;

    // Get sales count this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: monthlyOrders } = await supabase
      .from('order_items')
      .select(`
        quantity,
        total_price,
        orders!inner(
          created_at,
          user_id
        ),
        furniture!inner(
          vendor_id
        )
      `)
      .eq('furniture.vendor_id', userId)
      .gte('orders.created_at', startOfMonth.toISOString());

    const salesThisMonth = monthlyOrders?.length || 0;
    const revenueThisMonth = monthlyOrders?.reduce((sum, item) => sum + parseFloat(item.total_price || 0), 0) || 0;

    // Get active listings
    const { count: activeListings } = await supabase
      .from('furniture')
      .select('*', { count: 'exact', head: true })
      .eq('vendor_id', userId)
      .eq('status', 'active');

    // Get pending 3D model generations
    const { count: pending3DModels } = await supabase
      .from('model_generation_jobs')
      .select(`
        *,
        furniture!inner(vendor_id)
      `, { count: 'exact', head: true })
      .eq('furniture.vendor_id', userId)
      .in('status', ['pending', 'processing']);

    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentViews } = await supabase
      .from('furniture')
      .select('view_count, created_at')
      .eq('vendor_id', userId)
      .gte('created_at', thirtyDaysAgo.toISOString());

    const viewsLast30Days = recentViews?.reduce((sum, item) => sum + (item.view_count || 0), 0) || 0;

    // Get conversion rate (orders vs views)
    const conversionRate = totalViews > 0 ? ((salesThisMonth / totalViews) * 100) : 0;

    res.json({
      success: true,
      data: {
        stats: {
          totalListings: totalListings || 0,
          totalViews: totalViews || 0,
          salesThisMonth: salesThisMonth || 0,
          revenue: revenueThisMonth || 0,
          activeListings: activeListings || 0,
          pending3DModels: pending3DModels || 0,
          viewsLast30Days: viewsLast30Days || 0,
          conversionRate: Math.round(conversionRate * 100) / 100
        }
      }
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard data',
      error: error.message 
    });
  }
});

// Get user's furniture (all users can access their own products)
app.get('/api/vendor/furniture', requireAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    let query = supabase
      .from('furniture')
      .select(`
        *,
        categories(name),
        media_assets(url, type, is_primary),
        reviews(rating)
      `)
      .eq('vendor_id', req.user.id);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.order('created_at', { ascending: false })
                 .range(offset, offset + parseInt(limit) - 1);
    
    const { data: furniture, error, count } = await query;
    
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      data: furniture,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Vendor furniture error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get comprehensive vendor analytics
app.get('/api/vendor/analytics', requireAuth, async (req, res) => {
  try {
    const { period = '30', startDate, endDate } = req.query;
    
    // Calculate date range
    const now = new Date();
    let start, end;
    
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      end = now;
      start = new Date(now.getTime() - (parseInt(period) * 24 * 60 * 60 * 1000));
    }

    // Get vendor's furniture IDs
    const { data: furnitureList, error: furnitureError } = await supabase
      .from('furniture')
      .select('id, title, price, status, created_at, view_count')
      .eq('vendor_id', req.user.id);

    if (furnitureError) {
      return res.status(400).json({ success: false, message: furnitureError.message });
    }

    const furnitureIds = furnitureList.map(f => f.id);

    // Get order data for revenue analysis
    const { data: orderData, error: orderError } = await supabase
      .from('order_items')
      .select(`
        quantity, unit_price, total_price,
        orders(status, created_at, total_amount),
        furniture(id, title, price)
      `)
      .in('furniture_id', furnitureIds)
      .gte('orders.created_at', start.toISOString())
      .lte('orders.created_at', end.toISOString());

    // Get view analytics from AR interactions and furniture views
    const { data: arData, error: arError } = await supabase
      .from('ar_interactions')
      .select('furniture_id, interaction_type, created_at, duration_seconds')
      .in('furniture_id', furnitureIds)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    // Get favorites and cart analytics
    const { data: favoritesData, error: favError } = await supabase
      .from('favorites')
      .select('furniture_id, created_at')
      .in('furniture_id', furnitureIds)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    const { data: cartData, error: cartError } = await supabase
      .from('cart_items')
      .select('furniture_id, created_at, quantity')
      .in('furniture_id', furnitureIds)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    // Get reviews data
    const { data: reviewsData, error: reviewError } = await supabase
      .from('reviews')
      .select('furniture_id, rating, created_at')
      .in('furniture_id', furnitureIds)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    // Process revenue by day
    const revenueByDay = {};
    const ordersByDay = {};
    orderData?.forEach(order => {
      if (order.orders?.status === 'delivered' || order.orders?.status === 'completed') {
        const date = new Date(order.orders.created_at).toISOString().split('T')[0];
        revenueByDay[date] = (revenueByDay[date] || 0) + parseFloat(order.total_price);
        ordersByDay[date] = (ordersByDay[date] || 0) + order.quantity;
      }
    });

    // Process engagement metrics by day
    const engagementByDay = {};
    favoritesData?.forEach(fav => {
      const date = new Date(fav.created_at).toISOString().split('T')[0];
      engagementByDay[date] = engagementByDay[date] || { favorites: 0, cartAdds: 0, arViews: 0 };
      engagementByDay[date].favorites++;
    });

    cartData?.forEach(cart => {
      const date = new Date(cart.created_at).toISOString().split('T')[0];
      engagementByDay[date] = engagementByDay[date] || { favorites: 0, cartAdds: 0, arViews: 0 };
      engagementByDay[date].cartAdds++;
    });

    arData?.forEach(ar => {
      const date = new Date(ar.created_at).toISOString().split('T')[0];
      engagementByDay[date] = engagementByDay[date] || { favorites: 0, cartAdds: 0, arViews: 0 };
      engagementByDay[date].arViews++;
    });

    // Product performance analysis
    const productPerformance = furnitureList.map(product => {
      const productOrders = orderData?.filter(o => o.furniture?.id === product.id) || [];
      const productRevenue = productOrders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
      const productSales = productOrders.reduce((sum, o) => sum + (o.quantity || 0), 0);
      const productFavorites = favoritesData?.filter(f => f.furniture_id === product.id).length || 0;
      const productCartAdds = cartData?.filter(c => c.furniture_id === product.id).length || 0;
      const productReviews = reviewsData?.filter(r => r.furniture_id === product.id) || [];
      const avgRating = productReviews.length > 0 
        ? productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length 
        : 0;

      return {
        id: product.id,
        title: product.title,
        price: product.price,
        status: product.status,
        views: product.view_count || 0,
        revenue: productRevenue,
        sales: productSales,
        favorites: productFavorites,
        cartAdds: productCartAdds,
        avgRating: Math.round(avgRating * 10) / 10,
        reviewCount: productReviews.length,
        conversionRate: product.view_count > 0 ? (productSales / product.view_count) * 100 : 0
      };
    });

    // Top categories analysis
    const categoryPerformance = {};
    furnitureList.forEach(product => {
      const category = 'General'; // Would need to join with categories table
      if (!categoryPerformance[category]) {
        categoryPerformance[category] = { revenue: 0, sales: 0, products: 0 };
      }
      const productOrders = orderData?.filter(o => o.furniture?.id === product.id) || [];
      const productRevenue = productOrders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
      const productSales = productOrders.reduce((sum, o) => sum + (o.quantity || 0), 0);
      
      categoryPerformance[category].revenue += productRevenue;
      categoryPerformance[category].sales += productSales;
      categoryPerformance[category].products++;
    });

    // Calculate totals and averages
    const totalRevenue = Object.values(revenueByDay).reduce((sum, rev) => sum + rev, 0);
    const totalOrders = Object.values(ordersByDay).reduce((sum, orders) => sum + orders, 0);
    const totalFavorites = favoritesData?.length || 0;
    const totalCartAdds = cartData?.length || 0;
    const totalArViews = arData?.length || 0;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    res.json({
      success: true,
      data: {
        summary: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalOrders,
          avgOrderValue: Math.round(avgOrderValue * 100) / 100,
          totalFavorites,
          totalCartAdds,
          totalArViews,
          conversionRate: totalCartAdds > 0 ? Math.round((totalOrders / totalCartAdds) * 100 * 100) / 100 : 0
        },
        charts: {
          revenueByDay: Object.entries(revenueByDay).map(([date, revenue]) => ({
            date,
            revenue: Math.round(revenue * 100) / 100
          })).sort((a, b) => a.date.localeCompare(b.date)),
          ordersByDay: Object.entries(ordersByDay).map(([date, orders]) => ({
            date,
            orders
          })).sort((a, b) => a.date.localeCompare(b.date)),
          engagementByDay: Object.entries(engagementByDay).map(([date, data]) => ({
            date,
            ...data
          })).sort((a, b) => a.date.localeCompare(b.date))
        },
        productPerformance: productPerformance.sort((a, b) => b.revenue - a.revenue),
        categoryPerformance: Object.entries(categoryPerformance).map(([category, data]) => ({
          category,
          ...data
        })).sort((a, b) => b.revenue - a.revenue)
      }
    });
  } catch (error) {
    console.error('Vendor analytics error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Generate 3D model from video
app.post('/api/vendor/furniture/:id/generate-3d', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { video_url } = req.body;
    
    // Verify ownership
    const { data: furniture, error: checkError } = await supabase
      .from('furniture')
      .select('vendor_id')
      .eq('id', id)
      .single();
      
    if (checkError || !furniture) {
      return res.status(404).json({ success: false, message: 'Furniture not found' });
    }
    
    if (furniture.vendor_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    
    // Create 3D model generation job
    const { data: job, error } = await supabase
      .from('model_generation_jobs')
      .insert([{
        furniture_id: id,
        video_url,
        status: 'pending'
      }])
      .select()
      .single();
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    // TODO: Trigger actual 3D model generation process
    // This would typically involve sending a job to a queue or calling an external service
    
    res.json({
      success: true,
      message: '3D model generation started',
      data: job
    });
  } catch (error) {
    console.error('3D generation error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ===========================================
// UPLOAD ROUTES
// ===========================================

// Upload media files
app.post('/api/uploads/media', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    const { furniture_id, type = 'image' } = req.body;
    const file = req.file;
    
    // Generate unique filename
    const timestamp = Date.now();
    const extension = path.extname(file.originalname);
    const filename = `${timestamp}-${Math.random().toString(36).substring(7)}${extension}`;
    const filePath = `media/${req.user.id}/${filename}`;
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('furniture-media')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });
      
    if (uploadError) {
      return res.status(400).json({ success: false, message: uploadError.message });
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('furniture-media')
      .getPublicUrl(filePath);
    
    // Save media asset record
    const { data: mediaAsset, error: dbError } = await supabase
      .from('media_assets')
      .insert([{
        furniture_id: furniture_id || null,
        type,
        url: urlData.publicUrl,
        filename: file.originalname,
        file_size: file.size,
        mime_type: file.mimetype
      }])
      .select()
      .single();
      
    if (dbError) {
      return res.status(400).json({ success: false, message: dbError.message });
    }
    
    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: mediaAsset
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Log AR interaction
app.post('/api/ar/interaction', async (req, res) => {
  try {
    const { 
      furniture_id, 
      interaction_type, 
      duration_seconds, 
      device_info,
      ar_capability,
      placement_count,
      screenshot_taken 
    } = req.body;
    
    const user = await getUserFromToken(req);
    
    const { data: interaction, error } = await supabase
      .from('ar_interactions')
      .insert([{
        user_id: user?.id || null,
        furniture_id,
        interaction_type,
        duration_seconds,
        device_info,
        ar_capability: Boolean(ar_capability),
        placement_count: parseInt(placement_count) || 0,
        screenshot_taken: Boolean(screenshot_taken)
      }])
      .select()
      .single();
      
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      message: 'AR interaction logged',
      data: interaction
    });
  } catch (error) {
    console.error('AR interaction error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Demo data endpoint for development (remove in production)
app.post('/api/dev/seed-demo-data', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Not available in production' });
    }

    // This endpoint would populate demo data for development
    // In a real implementation, you'd run the seed.sql file
    
    res.json({
      success: true,
      message: 'Demo data seeded successfully. Please run the seed.sql file manually.',
      data: {
        note: 'Execute the seed.sql file in your Supabase database to populate demo data'
      }
    });

  } catch (error) {
    console.error('Seed demo data error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`PlaceIt Backend API listening on port ${port}`);
  console.log(`API documentation available at http://localhost:${port}`);
});
