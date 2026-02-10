@echo off
echo Packaging files (excluding node_modules)...
tar -cvf deployment.tar --exclude "node_modules" --exclude ".git" --exclude ".idea" --exclude "dist" --exclude "deployment.tar" .

echo Uploading to 192.168.50.226...
scp deployment.tar illusion88@192.168.50.226:~/deployment.tar

echo Extracting and Deploying...
ssh illusion88@192.168.50.226 "mkdir -p ~/amc && tar -xvf ~/deployment.tar -C ~/amc && rm ~/deployment.tar && cd ~/amc && docker compose up -d --build"

echo Cleaning up local archive...
del deployment.tar

echo Deployment complete!
pause
