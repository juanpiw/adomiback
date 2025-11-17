START TRANSACTION;

CREATE TABLE IF NOT EXISTS founder_codes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  commune VARCHAR(120) NOT NULL,
  region VARCHAR(120) NOT NULL,
  category ENUM('commune','region','special') NOT NULL DEFAULT 'commune',
  max_uses INT NOT NULL DEFAULT 50,
  current_uses INT NOT NULL DEFAULT 0,
  benefit_months INT NOT NULL DEFAULT 3,
  allow_existing TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('active','expired','disabled') NOT NULL DEFAULT 'active',
  valid_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valid_until DATETIME NOT NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_founder_code (code),
  INDEX idx_founder_status (status),
  INDEX idx_founder_valid_until (valid_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS founder_code VARCHAR(40) NULL AFTER account_switch_source,
  ADD COLUMN IF NOT EXISTS founder_activated_at DATETIME NULL AFTER founder_code,
  ADD COLUMN IF NOT EXISTS founder_expires_at DATETIME NULL AFTER founder_activated_at,
  ADD COLUMN IF NOT EXISTS is_founder TINYINT(1) NOT NULL DEFAULT 0 AFTER founder_expires_at;

ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS founder_badge_until DATETIME NULL AFTER rating_average;

INSERT INTO founder_codes (code, commune, region, category, max_uses, current_uses, benefit_months, status, valid_from, valid_until, metadata)
VALUES
  ('FUNDADORALH','Alhué','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','alhue')),
  ('FUNDADORBUIN','Buin','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','buin')),
  ('FUNDADORCT','Calera de Tango','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','calera-de-tango')),
  ('FUNDADORCER','Cerrillos','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','cerrillos')),
  ('FUNDADORCN','Cerro Navia','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','cerro-navia')),
  ('FUNDADORCOL','Colina','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','colina')),
  ('FUNDADORCON','Conchalí','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','conchali')),
  ('FUNDADORCUR','Curacaví','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','curacavi')),
  ('FUNDADORBOS','El Bosque','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','el-bosque')),
  ('FUNDADOREM','El Monte','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','el-monte')),
  ('FUNDADOREC','Estación Central','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','estacion-central')),
  ('FUNDADORHUE','Huechuraba','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','huechuraba')),
  ('FUNDADORIND','Independencia','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','independencia')),
  ('FUNDADORIM','Isla de Maipo','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','isla-de-maipo')),
  ('FUNDADORLAC','La Cisterna','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','la-cisterna')),
  ('FUNDADORLF','La Florida','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','la-florida')),
  ('FUNDADORLGR','La Granja','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','la-granja')),
  ('FUNDADORLPI','La Pintana','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','la-pintana')),
  ('FUNDADORLRE','La Reina','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','la-reina')),
  ('FUNDADORLAM','Lampa','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','lampa')),
  ('FUNDADORLCO','Las Condes','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','las-condes')),
  ('FUNDADORLB','Lo Barnechea','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','lo-barnechea')),
  ('FUNDADORLE','Lo Espejo','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','lo-espejo')),
  ('FUNDADORLP','Lo Prado','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','lo-prado')),
  ('FUNDADORMAC','Macul','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','macul')),
  ('FUNDADORMAI','Maipú','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','maipu')),
  ('FUNDADORMP','María Pinto','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','maria-pinto')),
  ('FUNDADORMEL','Melipilla','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','melipilla')),
  ('FUNDADORNUN','Ñuñoa','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','nunoa')),
  ('FUNDADORPH','Padre Hurtado','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','padre-hurtado')),
  ('FUNDADORPAI','Paine','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','paine')),
  ('FUNDADORPEF','Peñaflor','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','penaflor')),
  ('FUNDADORPEL','Peñalolén','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','penalolen')),
  ('FUNDADORPIR','Pirque','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','pirque')),
  ('FUNDADORPRO','Providencia','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','providencia')),
  ('FUNDADORPUD','Pudahuel','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','pudahuel')),
  ('FUNDADORQUI','Quilicura','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','quilicura')),
  ('FUNDADORQN','Quinta Normal','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','quinta-normal')),
  ('FUNDADORREC','Recoleta','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','recoleta')),
  ('FUNDADORREN','Renca','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','renca')),
  ('FUNDADORSB','San Bernardo','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','san-bernardo')),
  ('FUNDADORSJ','San Joaquín','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','san-joaquin')),
  ('FUNDADORSJM','San José de Maipo','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','san-jose-de-maipo')),
  ('FUNDADORSM','San Miguel','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','san-miguel')),
  ('FUNDADORSPD','San Pedro','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','san-pedro')),
  ('FUNDADORSR','San Ramón','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','san-ramon')),
  ('FUNDADORSTGO','Santiago','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','santiago')),
  ('FUNDADORTAL','Talagante','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','talagante')),
  ('FUNDADORTIL','Tiltil','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','tiltil')),
  ('FUNDADORVIT','Vitacura','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','vitacura')),
  ('FUNDADORPA','Puente Alto','Región Metropolitana','commune',50,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','puente-alto')),
  ('FUNDADORRM','Región Metropolitana','Región Metropolitana','region',200,0,3,'active',NOW(),DATE_ADD(NOW(), INTERVAL 90 DAY),JSON_OBJECT('slug','region-metropolitana','category','regional'));

COMMIT;

