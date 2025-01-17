import React from 'react';
import DOM from 'react-dom-factories';
import expose from './expose';
import state from 'state';
import LeftHeaderButton from 'component-left-header-button';
import RightHeaderButton from 'component-right-header-button';
import results from 'plate-appearance-results';
import { normalize } from 'utils/functions';

const LOCATION_DENOMINATOR = 32767;

const BALLFIELD_MAX_WIDTH = 500;

export default class CardAtBat extends expose.Component {
  constructor(props) {
    super(props);
    this.expose();
    this.state = {};
  }

  renderField() {
    let playerPlateAppearances = this.props.plateAppearances;
    let indicators = [];

    playerPlateAppearances.forEach(value => {
      let x = -1;
      let y = -1;
      if (value.location) {
        x = value.location.x;
        y = value.location.y;
      }

      let new_x = Math.floor(
        normalize(
          x,
          0,
          LOCATION_DENOMINATOR,
          0,
          Math.min(window.innerWidth, BALLFIELD_MAX_WIDTH)
        )
      );
      let new_y = Math.floor(
        normalize(
          y,
          0,
          LOCATION_DENOMINATOR,
          0,
          Math.min(window.innerWidth, BALLFIELD_MAX_WIDTH)
        )
      );

      if (value.location && x && y) {
        let image = results.getNoHitResults().includes(value.result)
          ? '/server/assets/baseball-out.svg'
          : '/server/assets/baseball-hit.svg';
        let alt = results.getNoHitResults().includes(value.result)
          ? 'out'
          : 'hitg';
        indicators.push(
          DOM.img({
            key: value.id,
            src: image,
            alt: alt,
            style: {
              position: 'absolute',
              width: '20px',
              left: new_x + 'px',
              top: new_y + 'px',
            },
          })
        );
      }
    });

    return DOM.div(
      {
        id: 'ballfield',
        style: {
          position: 'relative',
          width: Math.min(window.innerWidth, BALLFIELD_MAX_WIDTH) + 'px',
          height: Math.min(window.innerWidth, BALLFIELD_MAX_WIDTH) + 'px',
          overflow: 'hidden',
        },
      },
      DOM.img({
        draggable: true,
        src: '/server/assets/ballfield2.png',
        style: {
          width: '100%',
        },
      }),
      indicators
    );
  }

  render() {
    return DOM.div(
      {
        className: 'card',
        style: {
          position: 'relative',
        },
      },
      DOM.div(
        {
          className: 'card-title',
          style: {},
        },
        React.createElement(LeftHeaderButton, {}),
        DOM.div(
          {
            className: 'prevent-overflow card-title-text-with-arrow',
          },
          this.props.player.name
        ),
        React.createElement(RightHeaderButton, {})
      ),
      DOM.div(
        {
          className: 'card-body',
          style: {
            maxWidth: BALLFIELD_MAX_WIDTH + 'px',
          },
        },
        this.renderField()
      )
    );
  }
}
