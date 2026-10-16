describe('TV Details', () => {
  it('loads a tv details page', () => {
    cy.loginAsAdmin();
    // Try to load stranger things
    cy.visit('/tv/66732');

    cy.get('[data-testid=media-title]').should(
      'contain',
      'Stranger Things (2016)'
    );
  });

  it('shows seasons and expands episodes', () => {
    cy.loginAsAdmin();

    // Try to load stranger things
    cy.visit('/tv/66732');

    // intercept request for season info
    cy.intercept('/api/v1/tv/66732/season/4').as('season4');

    cy.contains('Season 4').should('be.visible').scrollIntoView().click();

    cy.wait('@season4');

    cy.contains('Chapter Nine').should('be.visible');
  });
});

describe('TV ordering selector', () => {
  const standardOrdering = {
    id: 'default',
    name: 'Seasons',
    episodeCount: 4,
    groupCount: 1,
    isApplied: true,
  };
  const alternateOrdering = {
    id: 'absolute',
    name: 'Absolute Order',
    description: 'Watch in absolute episode order',
    episodeCount: 4,
    groupCount: 1,
    type: 'Absolute',
    isApplied: false,
  };
  const orderingList = (appliedOrderingId: string) => [
    {
      ...standardOrdering,
      isApplied: appliedOrderingId === standardOrdering.id,
    },
    {
      ...alternateOrdering,
      isApplied: appliedOrderingId === alternateOrdering.id,
    },
  ];

  const interceptOrderingUi = (initialAppliedOrderingId: string) => {
    let appliedOrderingId = initialAppliedOrderingId;

    cy.intercept('GET', '/api/v1/tv/66732/orderings', (req) =>
      req.reply(orderingList(appliedOrderingId))
    ).as('orderings');
    cy.intercept('PUT', '/api/v1/tv/66732/ordering', (req) => {
      appliedOrderingId = req.body.orderingId;
      req.reply(204);
    }).as('applyOrdering');
    cy.intercept('GET', '/api/v1/tv/66732', (req) =>
      req.continue((res) => {
        if (appliedOrderingId === standardOrdering.id) {
          delete res.body.currentOrdering;
        } else {
          res.body.currentOrdering = {
            ...alternateOrdering,
            isApplied: true,
          };
        }
      })
    ).as('tvDetails');
  };

  it('hides the ordering button for non-admin users', () => {
    cy.intercept('GET', '/api/v1/tv/66732/orderings').as('orderings');
    cy.loginAsUser();
    cy.visit('/tv/66732');
    cy.get('[data-testid=media-title]').should('be.visible');
    cy.get('[data-testid=ordering-selector-button]').should('not.exist');
    cy.get('@orderings.all').should('have.length', 0);
  });

  it('hides the ordering button when Seasons is the only ordering', () => {
    cy.loginAsAdmin();
    cy.intercept('GET', '/api/v1/tv/66732/orderings', [standardOrdering]);
    cy.visit('/tv/66732');
    cy.get('[data-testid=media-title]').should('be.visible');
    cy.get('[data-testid=ordering-selector-button]').should('not.exist');
  });

  it('shows the fetch error state in the ordering modal', () => {
    cy.loginAsAdmin();
    cy.intercept('GET', '/api/v1/tv/66732/orderings', {
      statusCode: 500,
    }).as('orderings');
    cy.visit('/tv/66732');
    cy.get('[data-testid=ordering-selector-button]')
      .should('be.visible')
      .click();
    cy.contains('Unable to retrieve available orderings.').should('be.visible');
  });

  it('keeps the ordering button hidden while orderings are loading', () => {
    cy.loginAsAdmin();
    cy.intercept(
      'GET',
      '/api/v1/tv/66732/orderings',
      (req) =>
        new Promise((resolve) => {
          setTimeout(() => {
            req.reply([standardOrdering, alternateOrdering]);
            resolve(null);
          }, 500);
        })
    ).as('orderings');
    cy.visit('/tv/66732');
    cy.get('[data-testid=media-title]').should('be.visible');
    cy.get('[data-testid=ordering-selector-button]').should('not.exist');
    cy.wait('@orderings');
    cy.get('[data-testid=ordering-selector-button]').should('be.visible');
  });

  it('preselects the applied alternate ordering', () => {
    interceptOrderingUi(alternateOrdering.id);
    cy.loginAsAdmin();
    cy.visit('/tv/66732');
    cy.get('[data-testid=ordering-selector-button]')
      .should('be.visible')
      .click();
    cy.get('[data-testid=ordering-option-default]').should(
      'have.attr',
      'aria-pressed',
      'false'
    );
    cy.get('[data-testid=ordering-option-absolute]').should(
      'have.attr',
      'aria-pressed',
      'true'
    );
  });

  it('applies an alternate ordering without a page reload', () => {
    interceptOrderingUi(standardOrdering.id);
    cy.loginAsAdmin();
    cy.visit('/tv/66732');
    cy.get('[data-testid=ordering-selector-button]')
      .should('be.visible')
      .click();
    cy.get('[data-testid=ordering-option-default]').should(
      'have.attr',
      'aria-pressed',
      'true'
    );
    cy.get('[data-testid=ordering-option-absolute]').click();
    cy.get('[data-testid=modal-ok-button]').click();
    cy.wait('@applyOrdering')
      .its('request.body.orderingId')
      .should('eq', alternateOrdering.id);
    cy.get('h2').contains('Absolute Order').should('be.visible');
    cy.url().should('contain', '/tv/66732');
  });

  it('shows an apply error in the ordering modal', () => {
    interceptOrderingUi(standardOrdering.id);
    cy.intercept('PUT', '/api/v1/tv/66732/ordering', {
      statusCode: 500,
    }).as('applyOrdering');
    cy.loginAsAdmin();
    cy.visit('/tv/66732');
    cy.get('[data-testid=ordering-selector-button]')
      .should('be.visible')
      .click();
    cy.get('[data-testid=ordering-option-absolute]').click();
    cy.get('[data-testid=modal-ok-button]').click();
    cy.wait('@applyOrdering');
    cy.contains('Unable to apply the selected ordering.').should('be.visible');
  });

  it('resets a broken ordering to Seasons when only Seasons remains', () => {
    let appliedOrderingId = 'removed-ordering';

    cy.intercept('GET', '/api/v1/tv/66732/orderings', [standardOrdering]).as(
      'orderings'
    );
    cy.intercept('PUT', '/api/v1/tv/66732/ordering', (req) => {
      appliedOrderingId = req.body.orderingId;
      req.reply(204);
    }).as('applyOrdering');
    cy.intercept('GET', '/api/v1/tv/66732', (req) =>
      req.continue((res) => {
        if (appliedOrderingId === standardOrdering.id) {
          delete res.body.currentOrdering;
        } else {
          res.body.currentOrdering = {
            id: 'removed-ordering',
            name: 'Removed Ordering',
            episodeCount: 4,
            groupCount: 1,
          };
        }
      })
    ).as('tvDetails');
    cy.loginAsAdmin();
    cy.visit('/tv/66732');
    cy.get('[data-testid=ordering-selector-button]')
      .should('be.visible')
      .click();
    cy.contains('The applied ordering is unavailable on TMDB.').should(
      'be.visible'
    );
    cy.get('[data-testid=ordering-option-default]').should(
      'have.attr',
      'aria-pressed',
      'true'
    );
    cy.get('[data-testid=modal-ok-button]').click();
    cy.wait('@applyOrdering')
      .its('request.body.orderingId')
      .should('eq', standardOrdering.id);
    cy.get('h2').contains('Seasons').should('be.visible');
  });
});
