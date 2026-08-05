import { useEffect, useState } from 'react';

import { publicApi } from '../lib/api.js';
import { money } from '../lib/format.js';
import { Stars } from '../components/ui.jsx';

/** Reviews are fetched only when a diner asks for them — one request per dish. */
function Reviews({ menuItemId }) {
  const [state, setState] = useState({ loading: true, reviews: [], error: null });

  useEffect(() => {
    let active = true;
    publicApi
      .getReviews(menuItemId)
      .then((reviews) => active && setState({ loading: false, reviews, error: null }))
      .catch((err) => active && setState({ loading: false, reviews: [], error: err.message }));
    return () => {
      active = false;
    };
  }, [menuItemId]);

  if (state.loading) return <p className="hint" style={{ marginTop: 10 }}>Loading reviews…</p>;
  if (state.error) return <p className="field-error">{state.error}</p>;
  if (!state.reviews.length) {
    return <p className="hint" style={{ marginTop: 10 }}>No reviews yet — you could be the first.</p>;
  }

  return (
    <div className="reviews">
      {state.reviews.map((review) => (
        <div className="review" key={review._id}>
          <div className="review-head">
            <Stars value={review.stars} />
            <span>{review.customerFirstName || 'Guest'}</span>
          </div>
          {review.comment && <p>“{review.comment}”</p>}
        </div>
      ))}
    </div>
  );
}

export default function DishCard({ item, quantity, onAdd, onQuantity, currency }) {
  const [showReviews, setShowReviews] = useState(false);

  return (
    <article className="dish">
      <div className="dish-body">
        <div className="dish-title">
          <span className={item.isVegetarian ? 'veg-mark' : 'nonveg-mark'} aria-hidden="true" />
          <span>{item.name}</span>
        </div>

        {item.description && <p className="dish-desc">{item.description}</p>}

        <div className="dish-meta">
          <span className="dish-price">{money(item.price, currency)}</span>
          {item.ratingCount > 0 ? (
            <Stars value={item.avgRating} count={item.ratingCount} />
          ) : (
            <span>New dish</span>
          )}
          {item.spiceLevel && item.spiceLevel !== 'none' && <span>· {item.spiceLevel}</span>}
          {item.preparationMinutes > 0 && <span>· ~{item.preparationMinutes} min</span>}
        </div>

        <button
          type="button"
          className="link-btn"
          style={{ marginTop: 8 }}
          onClick={() => setShowReviews((open) => !open)}
          aria-expanded={showReviews}
        >
          {showReviews ? 'Hide reviews' : 'Read reviews'}
        </button>

        {showReviews && <Reviews menuItemId={item._id} />}
      </div>

      <div className="dish-side">
        {item.imageUrl && <img className="dish-thumb" src={item.imageUrl} alt="" loading="lazy" />}

        {quantity > 0 ? (
          <div className="stepper">
            <button type="button" onClick={() => onQuantity(quantity - 1)} aria-label={`Remove one ${item.name}`}>
              −
            </button>
            <span>{quantity}</span>
            <button type="button" onClick={() => onQuantity(quantity + 1)} aria-label={`Add one ${item.name}`}>
              +
            </button>
          </div>
        ) : (
          <button type="button" className="add-btn" onClick={() => onAdd(item)}>
            Add
          </button>
        )}
      </div>
    </article>
  );
}
