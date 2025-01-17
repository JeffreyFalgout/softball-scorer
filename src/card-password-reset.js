import React from 'react';
import DOM from 'react-dom-factories';
import expose from './expose';
import dialog from 'dialog';
import network from 'network';
import LeftHeaderButton from 'component-left-header-button';
import RightHeaderButton from 'component-right-header-button';
import { setRoute } from 'actions/route';

export default class CardPasswordReset extends expose.Component {
  constructor(props) {
    super(props);
    this.expose();
    this.state = {};

    this.token = props.token;

    this.handleSubmitClick = async function() {
      const password = document.getElementById('password');
      const passwordConfirm = document.getElementById('passwordConfirm');

      if (!password.value || !passwordConfirm.value) {
        const map = {
          Password: password.value,
          'Confirm Password': passwordConfirm.value,
        };
        let missingFields = Object.keys(map).filter(field => {
          return !map[field];
        });
        dialog.show_notification(
          'Please fill out the following required fields: ' +
            missingFields.join(', ')
        );
        return;
      }

      if (password.value !== passwordConfirm.value) {
        dialog.show_notification('Passwords do not match');
        return;
      }

      let body = {
        token: this.token,
        password: password.value,
      };

      let response = await network.request(
        'POST',
        `server/account/reset-password`,
        JSON.stringify(body)
      );
      if (response.status === 204) {
        dialog.show_notification(
          `Success! Your password has been changed. Please login.`,
          function() {
            setRoute('/menu/login');
          }
        );
      } else if (response.status === 404) {
        dialog.show_notification(
          `Error! We were not able to change your password. The activation link may have expired. Please request another password reset.`,
          function() {
            setRoute('/menu/login');
          }
        );
      } else {
        dialog.show_notification(
          `Error! We were not able to change your password. Please request another password reset. ${
            response.body ? response.body.message : ''
          }`,
          function() {
            setRoute('/menu/login');
          }
        );
      }
    };
  }

  renderAuthInterface() {
    return DOM.div(
      {
        className: 'auth-input-container',
      },
      DOM.div(
        {
          className: 'text-div',
        },
        'Please complete the form to change your password'
      ),
      DOM.input({
        key: 'password',
        id: 'password',
        className: 'auth-input',
        placeholder: 'Password',
        type: 'password',
      }),
      DOM.input({
        key: 'passwordConfirm',
        id: 'passwordConfirm',
        className: 'auth-input',
        placeholder: 'Confirm Password',
        type: 'password',
      }),
      // TODO: capcha
      this.renderSubmitButton()
    );
  }

  renderSubmitButton() {
    return DOM.div(
      {
        key: 'submit',
        id: 'submit',
        className: 'button confirm-button',
        onClick: this.handleSubmitClick.bind(this),
        style: {
          marginLeft: '0',
        },
      },
      'Submit'
    );
  }

  render() {
    return DOM.div(
      {
        style: {},
      },
      DOM.div(
        {
          className: 'card-title',
        },
        React.createElement(LeftHeaderButton, {}),
        DOM.div(
          {
            style: {},
          },
          'Reset Password'
        ),
        React.createElement(RightHeaderButton, {})
      ),
      DOM.div(
        {
          className: 'card-body',
        },
        this.renderAuthInterface()
      )
    );
  }
}
